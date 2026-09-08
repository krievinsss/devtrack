import "server-only";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { database, withTransactionDatabase } from "@/db/client";
import { defaultSchoolId } from "@/db/directory";
import {
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  classrooms,
  desks,
  groupMemberships,
  groups,
  schoolMemberships,
  users,
} from "@/db/schema";
import {
  attendanceMinutesLate,
  attendanceSummary,
  lessonStatusesForCheckIn,
  overallAttendanceStatus,
} from "@/lib/attendance";
import { getClassroom, getDeskByQrToken } from "./classrooms";

export class AttendanceAccessError extends Error {
  constructor(message = "You do not have access to this lesson") {
    super(message);
    this.name = "AttendanceAccessError";
  }
}
export class AttendanceConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "AttendanceConflictError";
  }
}
export class AttendanceNotFoundError extends Error {
  constructor(message = "Lesson session not found") {
    super(message);
    this.name = "AttendanceNotFoundError";
  }
}

export async function getAttendanceDashboard(
  user,
  { sessionId = null, historyLimit = 20 } = {},
) {
  const db = database(),
    schoolId = schoolFor(user);
  let sessionRows = await db
    .select()
    .from(attendanceSessions)
    .where(eq(attendanceSessions.schoolId, schoolId))
    .orderBy(desc(attendanceSessions.openedAt))
    .limit(Math.min(100, historyLimit));
  if (!isSchoolWide(user))
    sessionRows = sessionRows.filter((session) =>
      canAccessGroup(user, session.groupId),
    );
  let selected = sessionId
    ? sessionRows.find((item) => item.id === sessionId)
    : sessionRows.find((item) => item.status === "open") ||
      sessionRows[0] ||
      null;
  if (sessionId && !selected) {
    const rows = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.id, sessionId),
          eq(attendanceSessions.schoolId, schoolId),
        ),
      )
      .limit(1);
    selected = rows[0] || null;
    if (
      selected &&
      !isSchoolWide(user) &&
      !canAccessGroup(user, selected.groupId)
    )
      throw new AttendanceAccessError();
  }
  const active = sessionRows.filter((item) => item.status === "open");
  return {
    active: await Promise.all(
      active.map((item) => hydrateSession(db, item, false)),
    ),
    selected: selected ? await hydrateSession(db, selected, true) : null,
    history: await Promise.all(
      sessionRows
        .filter((item) => item.status !== "open")
        .map((item) => hydrateSession(db, item, false)),
    ),
  };
}

export async function getStudentAttendance(user, { limit = 100 } = {}) {
  if (user.role !== "student" || !user.membershipId)
    throw new AttendanceAccessError();
  const db = database();
  const rows = await db
    .select({
      record: attendanceRecords,
      session: attendanceSessions,
      classroomName: classrooms.name,
      groupName: groups.name,
      deskCode: desks.code,
      deskLabel: desks.label,
    })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceSessions.id, attendanceRecords.sessionId),
    )
    .innerJoin(classrooms, eq(classrooms.id, attendanceSessions.classroomId))
    .innerJoin(groups, eq(groups.id, attendanceSessions.groupId))
    .leftJoin(desks, eq(desks.id, attendanceRecords.deskId))
    .where(
      and(
        eq(attendanceRecords.studentMembershipId, user.membershipId),
        eq(attendanceSessions.schoolId, schoolFor(user)),
      ),
    )
    .orderBy(desc(attendanceSessions.startsAt))
    .limit(Math.min(250, limit));
  const records = rows.map((row) =>
    recordDto(row.record, row.session, {
      classroomName: row.classroomName,
      groupName: row.groupName,
      deskCode: row.deskCode,
      deskLabel: row.deskLabel,
    }),
  );
  const checkInRequired = await studentCheckInRequirement(db, user);
  return { records, summary: attendanceSummary(records), checkInRequired };
}

export async function getDisciplineAttendance(user) {
  if (
    !["teacher", "admin"].includes(user.role) &&
    user.platformRole !== "super_admin"
  )
    throw new AttendanceAccessError();
  const rows = await database()
    .select({
      sessionId: attendanceSessions.id,
      groupId: attendanceSessions.groupId,
      title: attendanceSessions.title,
      startsAt: attendanceSessions.startsAt,
      sessionStatus: attendanceSessions.status,
      lessonStatuses: attendanceRecords.lessonStatuses,
      status: attendanceRecords.status,
      checkedInAt: attendanceRecords.checkedInAt,
      studentId: schoolMemberships.userId,
    })
    .from(attendanceRecords)
    .innerJoin(
      attendanceSessions,
      eq(attendanceSessions.id, attendanceRecords.sessionId),
    )
    .innerJoin(
      schoolMemberships,
      eq(schoolMemberships.id, attendanceRecords.studentMembershipId),
    )
    .where(
      and(
        eq(attendanceSessions.schoolId, schoolFor(user)),
        ne(attendanceSessions.status, "cancelled"),
      ),
    )
    .orderBy(asc(attendanceSessions.startsAt));

  const visible = isSchoolWide(user)
    ? rows
    : rows.filter((row) => canAccessGroup(user, row.groupId));
  return visible.flatMap((row) => {
    const lessons =
      Array.isArray(row.lessonStatuses) && row.lessonStatuses.length
        ? row.lessonStatuses
        : [
            {
              period: null,
              startsAt: iso(row.startsAt),
              status: row.status,
              minutesLate: attendanceMinutesLate({
                startsAt: row.startsAt,
                checkedInAt: row.checkedInAt,
              }),
            },
          ];
    return lessons.map((lesson, index) => ({
      id: `${row.sessionId}:${lesson.period ?? index}`,
      sessionId: row.sessionId,
      studentId: row.studentId,
      groupId: row.groupId,
      title: row.title,
      period: lesson.period ?? null,
      startsAt: lesson.startsAt || iso(row.startsAt),
      status: lesson.status || row.status,
      minutesLate:
        lesson.status === "late" && row.checkedInAt
          ? attendanceMinutesLate({
              startsAt: lesson.startsAt || row.startsAt,
              checkedInAt: row.checkedInAt,
            })
          : 0,
    }));
  });
}

async function studentCheckInRequirement(db, user) {
  const activeRows = await db
    .select({ session: attendanceSessions, classroomName: classrooms.name })
    .from(attendanceSessions)
    .innerJoin(
      groupMemberships,
      and(
        eq(groupMemberships.groupId, attendanceSessions.groupId),
        eq(groupMemberships.membershipId, user.membershipId),
        eq(groupMemberships.relation, "student"),
      ),
    )
    .innerJoin(classrooms, eq(classrooms.id, attendanceSessions.classroomId))
    .where(
      and(
        eq(attendanceSessions.schoolId, schoolFor(user)),
        eq(attendanceSessions.status, "open"),
      ),
    )
    .orderBy(desc(attendanceSessions.openedAt))
    .limit(1);
  const active = activeRows[0];
  if (!active) return null;

  const ownRecord = await db
    .select({ id: attendanceRecords.id })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.sessionId, active.session.id),
        eq(attendanceRecords.studentMembershipId, user.membershipId),
      ),
    )
    .limit(1);
  if (ownRecord.length) return null;

  const [roomRows, deskRows, occupiedRows] = await Promise.all([
    db
      .select({
        canvasWidth: classrooms.canvasWidth,
        canvasHeight: classrooms.canvasHeight,
      })
      .from(classrooms)
      .where(eq(classrooms.id, active.session.classroomId))
      .limit(1),
    db
      .select({
        id: desks.id,
        code: desks.code,
        label: desks.label,
        x: desks.x,
        y: desks.y,
        width: desks.width,
        height: desks.height,
      })
      .from(desks)
      .where(eq(desks.classroomId, active.session.classroomId))
      .orderBy(asc(desks.code)),
    db
      .select({ deskId: attendanceRecords.deskId })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.sessionId, active.session.id)),
  ]);
  const occupied = new Set(
    occupiedRows.map((row) => row.deskId).filter(Boolean),
  );
  return {
    session: sessionDto(active.session, {
      classroomName: active.classroomName,
    }),
    classroom: {
      id: active.session.classroomId,
      name: active.classroomName,
      canvasWidth: roomRows[0]?.canvasWidth || 1200,
      canvasHeight: roomRows[0]?.canvasHeight || 720,
    },
    desks: deskRows.map((desk) => ({
      ...desk,
      occupied: occupied.has(desk.id),
    })),
  };
}

export async function openAttendanceSession(user, input) {
  assertManage(user);
  if (!isSchoolWide(user) && !canAccessGroup(user, input.groupId))
    throw new AttendanceAccessError("You are not assigned to this group");
  const room = await getClassroom(user, input.classroomId);
  if (!room.active)
    throw new AttendanceConflictError("This classroom is archived");
  const start = new Date(input.startsAt),
    end = new Date(input.endsAt);
  if (end <= start)
    throw new AttendanceConflictError("Lesson end must be after its start");
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const groupRows = await tx
        .select({ id: groups.id })
        .from(groups)
        .where(
          and(
            eq(groups.id, input.groupId),
            eq(groups.schoolId, schoolFor(user)),
            eq(groups.active, true),
          ),
        )
        .limit(1);
      if (!groupRows.length)
        throw new AttendanceNotFoundError("Group not found");
      const timetableLessons = normalizeTimetableLessons(
          input.timetableLessons,
          start,
          end,
        ),
        lessonCount = timetableLessons.length || 1;
      const [created] = await tx
        .insert(attendanceSessions)
        .values({
          schoolId: schoolFor(user),
          classroomId: input.classroomId,
          groupId: input.groupId,
          teacherMembershipId: user.membershipId || null,
          title: input.title || "Lesson",
          timetableLessons,
          lessonCount,
          startsAt: start,
          endsAt: end,
          lateAfterMinutes: input.lateAfterMinutes,
        })
        .returning();
      await audit(tx, user, "attendance.session_opened", created.id, {
        classroomId: created.classroomId,
        groupId: created.groupId,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
      });
      return hydrateSession(tx, created, true);
    }),
  );
}

export async function closeAttendanceSession(user, sessionId) {
  assertManage(user);
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const session = await requireSession(tx, user, sessionId);
      if (session.status !== "open")
        throw new AttendanceConflictError("This lesson is already closed");
      const students = await tx
        .select({ membershipId: groupMemberships.membershipId })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, session.groupId),
            eq(groupMemberships.relation, "student"),
          ),
        );
      const lessonStatuses = sessionLessons(session).map((lesson) => ({
        lessonId: lesson.id || null,
        period: Number(lesson.period) || null,
        status: "absent",
      }));
      if (students.length)
        await tx
          .insert(attendanceRecords)
          .values(
            students.map(({ membershipId }) => ({
              sessionId,
              studentMembershipId: membershipId,
              status: "absent",
              lessonStatuses,
              markedByUserId: user.id,
            })),
          )
          .onConflictDoNothing();
      const [closed] = await tx
        .update(attendanceSessions)
        .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.status, "open"),
          ),
        )
        .returning();
      if (!closed)
        throw new AttendanceConflictError(
          "This lesson was closed in another window",
        );
      await audit(tx, user, "attendance.session_closed", sessionId, {
        studentCount: students.length,
      });
      return hydrateSession(tx, closed, true);
    }),
  );
}

export async function cancelAttendanceSession(user, sessionId) {
  assertManage(user);
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const session = await requireSession(tx, user, sessionId);
      if (session.status !== "open")
        throw new AttendanceConflictError(
          "Only an open lesson can be cancelled",
        );
      await tx
        .delete(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, sessionId));
      const [cancelled] = await tx
        .update(attendanceSessions)
        .set({
          status: "cancelled",
          closedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(attendanceSessions.id, sessionId),
            eq(attendanceSessions.status, "open"),
          ),
        )
        .returning();
      await audit(tx, user, "attendance.session_cancelled", sessionId, {});
      return hydrateSession(tx, cancelled, true);
    }),
  );
}

export async function markAttendance(
  user,
  { sessionId, studentMembershipId, status, note = "" },
) {
  if (!user.permissionKeys?.includes("attendance.override"))
    throw new AttendanceAccessError();
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const session = await requireSession(tx, user, sessionId);
      const student = await tx
        .select({ membershipId: groupMemberships.membershipId })
        .from(groupMemberships)
        .innerJoin(
          schoolMemberships,
          eq(schoolMemberships.id, groupMemberships.membershipId),
        )
        .where(
          and(
            eq(groupMemberships.groupId, session.groupId),
            eq(groupMemberships.membershipId, studentMembershipId),
            eq(groupMemberships.relation, "student"),
            eq(schoolMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (!student.length)
        throw new AttendanceNotFoundError("Student is not in this group");
      const checkedInAt = ["present", "late"].includes(status)
        ? new Date()
        : null;
      const lessonStatuses = sessionLessons(session).map((lesson) => ({
        lessonId: lesson.id || null,
        period: Number(lesson.period) || null,
        status,
      }));
      const changes = {
        status,
        lessonStatuses,
        checkedInAt,
        markedByUserId: user.id,
        note: note || null,
        updatedAt: new Date(),
      };
      if (["absent", "excused"].includes(status)) changes.deskId = null;
      const [record] = await tx
        .insert(attendanceRecords)
        .values({
          sessionId,
          studentMembershipId,
          status,
          lessonStatuses,
          checkedInAt,
          markedByUserId: user.id,
          note: note || null,
        })
        .onConflictDoUpdate({
          target: [
            attendanceRecords.sessionId,
            attendanceRecords.studentMembershipId,
          ],
          set: changes,
        })
        .returning();
      await audit(tx, user, "attendance.record_updated", sessionId, {
        studentMembershipId,
        status,
      });
      return record;
    }),
  );
}

export async function checkInWithDesk(user, token) {
  if (user.role !== "student" || !user.membershipId)
    throw new AttendanceAccessError(
      "Sign in with a student account to check in",
    );
  const desk = await getDeskByQrToken(token);
  if (!desk || !desk.classroomActive)
    throw new AttendanceNotFoundError("This desk code is unavailable");
  if (desk.schoolId !== schoolFor(user)) throw new AttendanceAccessError();
  return checkInAtDesk(user, desk);
}

export async function checkInWithDeskId(user, deskId) {
  if (user.role !== "student" || !user.membershipId)
    throw new AttendanceAccessError(
      "Sign in with a student account to check in",
    );
  const rows = await database()
    .select({
      deskId: desks.id,
      deskCode: desks.code,
      deskLabel: desks.label,
      classroomId: classrooms.id,
      classroomName: classrooms.name,
      classroomActive: classrooms.active,
      schoolId: classrooms.schoolId,
    })
    .from(desks)
    .innerJoin(classrooms, eq(classrooms.id, desks.classroomId))
    .where(eq(desks.id, deskId))
    .limit(1);
  const desk = rows[0];
  if (!desk || !desk.classroomActive)
    throw new AttendanceNotFoundError("This desk is unavailable");
  if (desk.schoolId !== schoolFor(user)) throw new AttendanceAccessError();
  return checkInAtDesk(user, desk);
}

function checkInAtDesk(user, desk) {
  return withTransactionDatabase((db) =>
    db.transaction(async (tx) => {
      const sessions = await tx
          .select()
          .from(attendanceSessions)
          .where(
            and(
              eq(attendanceSessions.classroomId, desk.classroomId),
              eq(attendanceSessions.status, "open"),
            ),
          )
          .orderBy(desc(attendanceSessions.openedAt))
          .limit(1),
        session = sessions[0];
      if (!session)
        throw new AttendanceConflictError(
          "No lesson check-in is open in this classroom",
        );
      if (Date.now() > new Date(session.endsAt).getTime())
        throw new AttendanceConflictError(
          "This lesson check-in window has ended",
        );
      const membership = await tx
        .select({ id: groupMemberships.membershipId })
        .from(groupMemberships)
        .where(
          and(
            eq(groupMemberships.groupId, session.groupId),
            eq(groupMemberships.membershipId, user.membershipId),
            eq(groupMemberships.relation, "student"),
          ),
        )
        .limit(1);
      if (!membership.length)
        throw new AttendanceAccessError("This lesson is for another group");
      const occupied = await tx
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.sessionId, session.id),
            eq(attendanceRecords.deskId, desk.deskId),
            sql`${attendanceRecords.studentMembershipId} <> ${user.membershipId}`,
          ),
        )
        .limit(1);
      if (occupied.length)
        throw new AttendanceConflictError(
          "This desk is already registered by another student",
        );
      const now = new Date(),
        lessonStatuses = lessonStatusesForCheckIn(
          sessionLessons(session),
          now,
          session.lateAfterMinutes,
        ),
        status = overallAttendanceStatus(lessonStatuses);
      const [record] = await tx
        .insert(attendanceRecords)
        .values({
          sessionId: session.id,
          studentMembershipId: user.membershipId,
          deskId: desk.deskId,
          status,
          lessonStatuses,
          checkedInAt: now,
        })
        .onConflictDoUpdate({
          target: [
            attendanceRecords.sessionId,
            attendanceRecords.studentMembershipId,
          ],
          set: {
            deskId: desk.deskId,
            status,
            lessonStatuses,
            checkedInAt: now,
            updatedAt: now,
          },
        })
        .returning();
      await audit(tx, user, "attendance.student_checked_in", session.id, {
        deskId: desk.deskId,
        status,
      });
      return {
        session: sessionDto(session, { classroomName: desk.classroomName }),
        record: recordDto(record, session, {
          deskCode: desk.deskCode,
          deskLabel: desk.deskLabel,
        }),
        desk,
      };
    }),
  );
}

async function requireSession(db, user, id) {
  const rows = await db
      .select()
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.id, id),
          eq(attendanceSessions.schoolId, schoolFor(user)),
        ),
      )
      .limit(1),
    session = rows[0];
  if (!session) throw new AttendanceNotFoundError();
  if (!isSchoolWide(user) && !canAccessGroup(user, session.groupId))
    throw new AttendanceAccessError();
  return session;
}

async function hydrateSession(db, session, withStudents) {
  const [roomRows, groupRows, records] = await Promise.all([
    db
      .select({ name: classrooms.name })
      .from(classrooms)
      .where(eq(classrooms.id, session.classroomId))
      .limit(1),
    db
      .select({ name: groups.name })
      .from(groups)
      .where(eq(groups.id, session.groupId))
      .limit(1),
    db
      .select({
        record: attendanceRecords,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        deskCode: desks.code,
        deskLabel: desks.label,
      })
      .from(attendanceRecords)
      .innerJoin(
        schoolMemberships,
        eq(schoolMemberships.id, attendanceRecords.studentMembershipId),
      )
      .innerJoin(users, eq(users.id, schoolMemberships.userId))
      .leftJoin(desks, eq(desks.id, attendanceRecords.deskId))
      .where(eq(attendanceRecords.sessionId, session.id))
      .orderBy(asc(users.firstName), asc(users.lastName)),
  ]);
  let studentRows = [],
    historicalRecords = [];
  if (withStudents) {
    [studentRows, historicalRecords] = await Promise.all([
      db
        .select({
          membershipId: schoolMemberships.id,
          userId: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(groupMemberships)
        .innerJoin(
          schoolMemberships,
          eq(schoolMemberships.id, groupMemberships.membershipId),
        )
        .innerJoin(users, eq(users.id, schoolMemberships.userId))
        .where(
          and(
            eq(groupMemberships.groupId, session.groupId),
            eq(groupMemberships.relation, "student"),
            eq(schoolMemberships.status, "active"),
            eq(users.active, true),
          ),
        )
        .orderBy(asc(users.firstName), asc(users.lastName)),
      db
        .select({
          studentMembershipId: attendanceRecords.studentMembershipId,
          status: attendanceRecords.status,
          lessonStatuses: attendanceRecords.lessonStatuses,
        })
        .from(attendanceRecords)
        .innerJoin(
          attendanceSessions,
          eq(attendanceSessions.id, attendanceRecords.sessionId),
        )
        .where(
          and(
            eq(attendanceSessions.groupId, session.groupId),
            ne(attendanceSessions.status, "cancelled"),
          ),
        ),
    ]);
  }
  const mapped = records.map((row) => ({
    ...recordDto(row.record, session, {
      deskCode: row.deskCode,
      deskLabel: row.deskLabel,
    }),
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
  }));
  const byMembership = new Map(
    mapped.map((item) => [item.studentMembershipId, item]),
  );
  return {
    ...sessionDto(session, {
      classroomName: roomRows[0]?.name || "Classroom",
      groupName: groupRows[0]?.name || "Group",
    }),
    summary: attendanceSummary(mapped),
    records: mapped,
    students: studentRows.map((student) => {
      const history = historicalRecords.filter(
        (record) => record.studentMembershipId === student.membershipId,
      );
      return {
        ...student,
        record: byMembership.get(student.membershipId) || null,
        attendanceStats: attendanceSummary(history),
      };
    }),
  };
}

function sessionDto(session, extra = {}) {
  return {
    id: session.id,
    classroomId: session.classroomId,
    groupId: session.groupId,
    title: session.title,
    timetableLessons: session.timetableLessons || [],
    lessonCount: session.lessonCount || 1,
    startsAt: iso(session.startsAt),
    endsAt: iso(session.endsAt),
    lateAfterMinutes: session.lateAfterMinutes,
    status: session.status,
    openedAt: iso(session.openedAt),
    closedAt: iso(session.closedAt),
    ...extra,
  };
}
function recordDto(record, session, extra = {}) {
  const timetableLessons = sessionLessons(session);
  const lessonStatuses = (record.lessonStatuses || []).map((lesson, index) => {
    const timetableLesson =
      timetableLessons.find(
        (item) =>
          (lesson.lessonId && item.id === lesson.lessonId) ||
          (lesson.period && Number(item.period) === Number(lesson.period)),
      ) || timetableLessons[index];
    const startsAt = timetableLesson?.startsAt || session.startsAt;
    return {
      ...lesson,
      startsAt: iso(startsAt),
      endsAt: iso(timetableLesson?.endsAt || session.endsAt),
      minutesLate:
        lesson.status === "late" && record.checkedInAt
          ? attendanceMinutesLate({ startsAt, checkedInAt: record.checkedInAt })
          : 0,
    };
  });
  return {
    id: record.id,
    sessionId: record.sessionId,
    studentMembershipId: record.studentMembershipId,
    deskId: record.deskId,
    title: session.title,
    startsAt: iso(session.startsAt),
    endsAt: iso(session.endsAt),
    status: record.status,
    lessonStatuses,
    lessonCount: lessonStatuses.length || session.lessonCount || 1,
    checkedInAt: iso(record.checkedInAt),
    minutesLate: attendanceMinutesLate({
      startsAt: session.startsAt,
      checkedInAt: record.checkedInAt,
    }),
    note: record.note || "",
    ...extra,
  };
}
function sessionLessons(session) {
  return Array.isArray(session.timetableLessons) &&
    session.timetableLessons.length
    ? session.timetableLessons
    : [
        {
          id: null,
          period: null,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
        },
      ];
}
function normalizeTimetableLessons(value, start, end) {
  return (Array.isArray(value) ? value : []).slice(0, 12).map((item) => ({
    id: String(item.id || ""),
    period: Number(item.period) || null,
    date: String(item.date || ""),
    start: String(item.start || ""),
    end: String(item.end || ""),
    startsAt: iso(item.startsAt) || start.toISOString(),
    endsAt: iso(item.endsAt) || end.toISOString(),
    subject: String(item.subject || "Lesson"),
  }));
}
function isSchoolWide(user) {
  return user?.role === "admin" || user?.platformRole === "super_admin";
}
function canAccessGroup(user, groupId) {
  return (user?.groupIds || []).includes(groupId);
}
function assertManage(user) {
  if (!user?.permissionKeys?.includes("attendance.manage_sessions"))
    throw new AttendanceAccessError();
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
async function audit(db, user, action, entityId, metadata) {
  await db.insert(auditLogs).values({
    schoolId: schoolFor(user),
    actorUserId: user.id,
    action,
    entityType: "attendance_session",
    entityId,
    metadata,
  });
}
