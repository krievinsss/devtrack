import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { database, withTransactionDatabase } from "@/db/client";
import { auditLogs, journalCourses, lessonPlanItems } from "@/db/schema";
import { defaultSchoolId } from "@/db/directory";

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
async function audit(db, user, action, entityId, metadata) {
  await db
    .insert(auditLogs)
    .values({
      schoolId: schoolFor(user),
      actorUserId: user.id,
      action,
      entityType: "journal_course",
      entityId,
      metadata,
    });
}
