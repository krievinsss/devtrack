import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { database } from "@/db/client";
import { defaultSchoolId } from "@/db/directory";
import { auditLogs } from "@/db/schema";
import {
  automaticallyOpenedSessionIds,
  isTimetableBlockActive,
  reconcileAttendanceBlocks,
  summarizeAttendanceAutomationRun,
} from "@/lib/attendanceAutomation";

export { summarizeAttendanceAutomationRun };
import {
  closeAttendanceSession,
  getAttendanceDashboard,
  openAttendanceSession,
} from "@/services/attendance";
import {
  attendanceBlocksFromTimetable,
  dateInRiga,
  timetableForUser,
} from "@/services/timetable";
import { getClassroomsForAttendanceAutomation } from "@/services/classrooms";
import { getGroups } from "@/services/groups";

export async function reconcileAutomaticAttendance(user, now = new Date()) {
  const [groups, classrooms] = await Promise.all([
    getGroups(),
    getClassroomsForAttendanceAutomation(user),
  ]);
  const closed = await closeExpiredAutomaticAttendance(user, now);
  const synced = await syncAutomaticAttendanceForTeacher(
    user,
    groups,
    classrooms,
    now,
  );
  return {
    ok:
      !closed.some((item) => item.status === "error") &&
      !synced.error &&
      !synced.skipped.some((skip) => skip.reason !== "already-created"),
    closed,
    results: [synced],
    summary: summarizeAttendanceAutomationRun({
      ok:
        !closed.some((item) => item.status === "error") &&
        !synced.error &&
        !synced.skipped.some((skip) => skip.reason !== "already-created"),
      closed,
      results: [synced],
      ranAt: now.toISOString(),
      durationMs: 0,
    }),
  };
}

export async function closeExpiredAutomaticAttendance(user, now = new Date()) {
  const dashboard = await getAttendanceDashboard(user, { historyLimit: 100 });
  const expired = dashboard.active.filter(
    (session) => new Date(session.endsAt).getTime() <= now.getTime(),
  );
  const automaticSessionIds = await getAutomaticAttendanceSessionIds(user, expired);
  const results = [];
  for (const session of expired.filter((item) => automaticSessionIds.has(item.id))) {
    try {
      await closeAttendanceSession(user, session.id);
      results.push({ teacherId: user.id, sessionId: session.id, status: "closed" });
    } catch (error) {
      results.push({
        teacherId: user.id,
        sessionId: session.id,
        status: "error",
        error: error?.message || "Could not close session",
      });
    }
  }
  return results;
}

export async function syncAutomaticAttendanceForTeacher(
  user,
  groups,
  classrooms,
  now = new Date(),
  { blockId = null } = {},
) {
  const date = dateInRiga(now);
  const timetable = await timetableForUser(user, groups, date);
  if (timetable.error) {
    return {
      teacherId: user.id,
      date,
      opened: [],
      skipped: [],
      error: timetable.error,
    };
  }
  const activeBlocks = attendanceBlocksFromTimetable(
    timetable.lessons,
    groups,
    { includeUnlinked: true },
  )
    .filter((block) => isTimetableBlockActive(block, now))
    .filter((block) => !blockId || block.id === blockId);
  if (!activeBlocks.length)
    return { teacherId: user.id, date, opened: [], skipped: [] };

  const dashboard = await getAttendanceDashboard(user, { historyLimit: 100 });
  const knownSessions = [...dashboard.active, ...dashboard.history];
  const { opened, skipped } = await reconcileAttendanceBlocks({
    user,
    blocks: activeBlocks,
    classrooms,
    knownSessions,
    openSession: (teacher, block, classroom) =>
      openAttendanceSession(teacher, {
        classroomId: classroom.id,
        groupId: block.groupId,
        title: block.subject,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        lateAfterMinutes: 10,
        timetableLessons: block.lessons,
        automatic: true,
      }),
  });
  return { teacherId: user.id, date, opened, skipped };
}

export async function getAutomaticAttendanceSessionIds(user, sessions) {
  if (!sessions.length) return new Set();
  const rows = await database()
    .select({ entityId: auditLogs.entityId, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.schoolId, user.schoolId || defaultSchoolId()),
        eq(auditLogs.entityType, "attendance_session"),
        eq(auditLogs.action, "attendance.session_opened"),
        inArray(auditLogs.entityId, sessions.map((session) => session.id)),
      ),
    );
  return automaticallyOpenedSessionIds(sessions, rows);
}
