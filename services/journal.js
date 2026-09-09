import "server-only";
import crypto from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { database, withTransactionDatabase } from "@/db/client";
import {
  auditLogs,
  journalCourses,
  journalEntries,
  lessonPlanItems,
} from "@/db/schema";
import { defaultSchoolId } from "@/db/directory";
import { rigaDateTimeIso, timetableForRange } from "@/services/timetable";

export class JournalAccessError extends Error {
  constructor(message = "You do not have access to this journal") {
    super(message);
    this.name = "JournalAccessError";
  }
}

export class JournalNotFoundError extends Error {
  constructor(message = "Journal not found") {
    super(message);
    this.name = "JournalNotFoundError";
  }
}

export async function getJournalCourses(user) {
  assertTeacher(user);
  const db = database();
  let courses = await db
    .select()
    .from(journalCourses)
    .where(
      and(
        eq(journalCourses.schoolId, schoolFor(user)),
        eq(journalCourses.active, true),
      ),
    )
    .orderBy(asc(journalCourses.subject));
  if (!isSchoolWide(user))
    courses = courses.filter((course) =>
      (user.groupIds || []).includes(course.groupId),
    );
  const ids = courses.map((course) => course.id);
  const items = ids.length
    ? await db
        .select()
        .from(lessonPlanItems)
        .where(inArray(lessonPlanItems.courseId, ids))
        .orderBy(asc(lessonPlanItems.sequence))
    : [];
  return courses.map((course) => ({
    ...course,
    createdAt: iso(course.createdAt),
    updatedAt: iso(course.updatedAt),
    items: items.filter((item) => item.courseId === course.id).map(planDto),
  }));
}

export async function saveJournalCourse(user, input) {
  assertManage(user);
  if (!isSchoolWide(user) && !(user.groupIds || []).includes(input.groupId))
    throw new JournalAccessError("You are not assigned to this group");
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(journalCourses)
        .where(
          and(
            eq(journalCourses.groupId, input.groupId),
            eq(journalCourses.schoolId, schoolFor(user)),
          ),
        )
        .orderBy(asc(journalCourses.createdAt));
      const match = existing.find(
        (course) =>
          course.subject.trim().toLowerCase() ===
          input.subject.trim().toLowerCase(),
      );
      let saved;
      if (match) {
        [saved] = await tx
          .update(journalCourses)
          .set({
            subject: input.subject.trim(),
            academicYear: input.academicYear || null,
            active: true,
            updatedAt: new Date(),
          })
          .where(eq(journalCourses.id, match.id))
          .returning();
      } else {
        [saved] = await tx
          .insert(journalCourses)
          .values({
            schoolId: schoolFor(user),
            groupId: input.groupId,
            teacherMembershipId: user.membershipId || null,
            subject: input.subject.trim(),
            academicYear: input.academicYear || null,
          })
          .returning();
      }
      await audit(tx, user, "journal.course_saved", saved.id, {
        groupId: saved.groupId,
        subject: saved.subject,
      });
      return {
        ...saved,
        createdAt: iso(saved.createdAt),
        updatedAt: iso(saved.updatedAt),
        items: [],
      };
    }),
  );
}

export async function replaceLessonPlan(user, courseId, inputItems) {
  assertManage(user);
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const course = await requireCourse(tx, user, courseId);
      await tx
        .delete(lessonPlanItems)
        .where(eq(lessonPlanItems.courseId, courseId));
      const values = inputItems.map((item, index) => ({
        courseId,
        sequence: index + 1,
        topic: item.topic.trim(),
        outcome: (item.outcome || "").trim(),
        type: item.type || "lesson",
        plannedDate: item.plannedDate || null,
        timetablePeriod: item.timetablePeriod || null,
        notes: (item.notes || "").trim(),
      }));
      const saved = values.length
        ? await tx.insert(lessonPlanItems).values(values).returning()
        : [];
      await audit(tx, user, "journal.lesson_plan_saved", courseId, {
        itemCount: saved.length,
      });
      return saved.map(planDto);
    }),
  );
}

export function currentAcademicRange(now = new Date()) {
  const year = now.getUTCFullYear(),
    month = now.getUTCMonth() + 1;
  const startYear = month >= 8 ? year : year - 1;
  return { start: `${startYear}-08-01`, end: `${startYear + 1}-07-31` };
}

export async function syncJournalFromTimetable(user, groups, range) {
  assertTeacher(user);
  const lessons = await timetableForRange(user, groups, range.start, range.end);
  if (!lessons.length) return { lessons: 0, courses: 0 };
  const groupByName = new Map(
    groups.map((group) => [normalize(group.name), group]),
  );
  let courseCount = 0;
  await withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(journalCourses)
        .where(eq(journalCourses.schoolId, schoolFor(user)));
      const courseMap = new Map(
        existing.map((course) => [
          courseKey(course.groupId, course.subject),
          course,
        ]),
      );
      for (const lesson of lessons) {
        const group = groupByName.get(normalize(lesson.group));
        if (
          !group ||
          (!isSchoolWide(user) && !(user.groupIds || []).includes(group.id))
        )
          continue;
        const key = courseKey(group.id, lesson.subject);
        let course = courseMap.get(key);
        if (!course) {
          [course] = await tx
            .insert(journalCourses)
            .values({
              schoolId: schoolFor(user),
              groupId: group.id,
              teacherMembershipId: user.membershipId || null,
              subject: lesson.subject,
              active: true,
            })
            .returning();
          courseMap.set(key, course);
          courseCount += 1;
        }
        const sourceKey = `timetable:${lesson.date}:${lesson.id}:${lesson.period || 0}`;
        await tx
          .insert(journalEntries)
          .values({
            courseId: course.id,
            source: "timetable",
            sourceKey,
            type: "lesson",
            date: lesson.date,
            startsAt: new Date(rigaDateTimeIso(lesson.date, lesson.start)),
            endsAt: new Date(rigaDateTimeIso(lesson.date, lesson.end)),
            timetableLessonId: lesson.id,
            timetablePeriod: lesson.period || null,
          })
          .onConflictDoUpdate({
            target: [journalEntries.courseId, journalEntries.sourceKey],
            set: {
              startsAt: new Date(rigaDateTimeIso(lesson.date, lesson.start)),
              endsAt: new Date(rigaDateTimeIso(lesson.date, lesson.end)),
              timetablePeriod: lesson.period || null,
              updatedAt: new Date(),
            },
          });
      }
    }),
  );
  return { lessons: lessons.length, courses: courseCount };
}

export async function getJournalEntries(user, courseIds = []) {
  assertTeacher(user);
  if (!courseIds.length) return [];
  const db = database();
  const rows = await db
    .select()
    .from(journalEntries)
    .where(inArray(journalEntries.courseId, courseIds))
    .orderBy(asc(journalEntries.date), asc(journalEntries.startsAt));
  return rows.filter((row) => row.metadata?.deleted !== true).map(entryDto);
}

export async function deleteJournalEntry(user, input) {
  assertManage(user);
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const course = await requireCourse(tx, user, input.courseId);
      const rows = await tx
        .select()
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.id, input.id),
            eq(journalEntries.courseId, course.id),
          ),
        )
        .limit(1);
      const entry = rows[0];
      if (!entry) throw new JournalNotFoundError("Journal entry not found");

      if (entry.source === "timetable")
        await tx
          .update(journalEntries)
          .set({
            metadata: {
              ...(entry.metadata || {}),
              deleted: true,
              deletedAt: new Date().toISOString(),
              deletedBy: user.id,
            },
            updatedAt: new Date(),
          })
          .where(eq(journalEntries.id, entry.id));
      else
        await tx.delete(journalEntries).where(eq(journalEntries.id, entry.id));

      await audit(tx, user, "journal.entry_deleted", entry.id, {
        courseId: course.id,
        source: entry.source,
      });
      return { id: entry.id, source: entry.source };
    }),
  );
}

export async function saveJournalEntry(user, input) {
  assertManage(user);
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const course = await requireCourse(tx, user, input.courseId);
      let saved;
      if (input.id) {
        const rows = await tx
          .select()
          .from(journalEntries)
          .where(
            and(
              eq(journalEntries.id, input.id),
              eq(journalEntries.courseId, course.id),
            ),
          )
          .limit(1);
        if (!rows[0]) throw new JournalNotFoundError("Journal entry not found");
        [saved] = await tx
          .update(journalEntries)
          .set({
            date: rows[0].source === "manual" ? input.date : rows[0].date,
            topic: input.topic || "",
            outcome: input.outcome || "",
            type: input.type || rows[0].type,
            timetablePeriod:
              rows[0].source === "manual"
                ? input.timetablePeriod || null
                : rows[0].timetablePeriod,
            attendanceOverrides:
              input.attendanceOverrides || rows[0].attendanceOverrides,
            metadata: input.metadata || rows[0].metadata,
            updatedAt: new Date(),
          })
          .where(eq(journalEntries.id, input.id))
          .returning();
      } else {
        const start = input.startsAt ? new Date(input.startsAt) : null;
        [saved] = await tx
          .insert(journalEntries)
          .values({
            courseId: course.id,
            source: "manual",
            sourceKey: `manual:${crypto.randomUUID()}`,
            type: input.type,
            date: input.date,
            timetablePeriod: input.timetablePeriod || null,
            startsAt: start,
            endsAt: input.endsAt ? new Date(input.endsAt) : start,
            topic: input.topic || "",
            outcome: input.outcome || "",
            attendanceOverrides: input.attendanceOverrides || {},
            metadata: input.metadata || {},
            createdBy: user.id,
          })
          .returning();
      }
      await audit(
        tx,
        user,
        input.id ? "journal.entry_updated" : "journal.entry_created",
        saved.id,
        {
          courseId: course.id,
          source: saved.source,
        },
      );
      return entryDto(saved);
    }),
  );
}

async function requireCourse(db, user, id) {
  const rows = await db
    .select()
    .from(journalCourses)
    .where(
      and(
        eq(journalCourses.id, id),
        eq(journalCourses.schoolId, schoolFor(user)),
      ),
    )
    .limit(1);
  const course = rows[0];
  if (!course) throw new JournalNotFoundError();
  if (!isSchoolWide(user) && !(user.groupIds || []).includes(course.groupId))
    throw new JournalAccessError();
  return course;
}

function assertTeacher(user) {
  if (
    !["teacher", "admin"].includes(user?.role) &&
    user?.platformRole !== "super_admin"
  )
    throw new JournalAccessError();
}
function assertManage(user) {
  assertTeacher(user);
  if (
    !user.permissionKeys?.includes("attendance.manage_sessions") &&
    !isSchoolWide(user)
  )
    throw new JournalAccessError("You cannot edit lesson plans");
}
function isSchoolWide(user) {
  return user?.role === "admin" || user?.platformRole === "super_admin";
}
function schoolFor(user) {
  return user?.schoolId || defaultSchoolId();
}
function iso(value) {
  return value instanceof Date
    ? value.toISOString()
    : value
      ? new Date(value).toISOString()
      : null;
}
function planDto(item) {
  return {
    ...item,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}
function entryDto(item) {
  return {
    ...item,
    startsAt: iso(item.startsAt),
    endsAt: iso(item.endsAt),
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}
function courseKey(groupId, subject) {
  return `${groupId}:${normalize(subject)}`;
}
function normalize(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("lv-LV")
    .replace(/\s+/g, " ");
}
async function audit(db, user, action, entityId, metadata) {
  await db.insert(auditLogs).values({
    schoolId: schoolFor(user),
    actorUserId: user.id,
    action,
    entityType: "journal_course",
    entityId,
    metadata,
  });
}
