import "server-only";
import {
  classroomForTimetableRoom,
  isTimetableBlockActive,
  sameScheduledSession,
} from "@/lib/attendanceAutomation";
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
import { getClassrooms } from "@/services/classrooms";
import { getGroups } from "@/services/groups";

export async function reconcileAutomaticAttendance(user, now = new Date()) {
  const [groups, classrooms] = await Promise.all([
    getGroups(),
    getClassrooms(user, { includeInactive: false }),
  ]);
  const closed = await closeExpiredAutomaticAttendance(user, now);
  const synced = await syncAutomaticAttendanceForTeacher(
    user,
    groups,
    classrooms,
    now,
  );
  return { closed, synced };
}

export async function closeExpiredAutomaticAttendance(user, now = new Date()) {
  const dashboard = await getAttendanceDashboard(user, { historyLimit: 100 });
  const expired = dashboard.active.filter(
    (session) => new Date(session.endsAt).getTime() <= now.getTime(),
  );
  const results = [];
  for (const session of expired) {
    try {
      await closeAttendanceSession(user, session.id);
      results.push({ sessionId: session.id, status: "closed" });
    } catch (error) {
      results.push({
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
) {
  const date = dateInRiga(now);
  const timetable = await timetableForUser(user, groups, date);
  const activeBlocks = attendanceBlocksFromTimetable(
    timetable.lessons,
    groups,
  ).filter((block) => isTimetableBlockActive(block, now));
  if (!activeBlocks.length)
    return { teacherId: user.id, date, opened: [], skipped: [] };

  const dashboard = await getAttendanceDashboard(user, { historyLimit: 100 });
  const knownSessions = [...dashboard.active, ...dashboard.history];
  const opened = [],
    skipped = [];
  for (const block of activeBlocks) {
    const classroom = classroomForTimetableRoom(block.room, classrooms);
    if (!classroom) {
      skipped.push({
        blockId: block.id,
        reason: block.room
          ? `DevTrack classroom not found for ${block.room}`
          : "Timetable classroom is missing",
      });
      continue;
    }
    if (
      knownSessions.some((session) =>
        sameScheduledSession(session, block, classroom.id),
      )
    ) {
      skipped.push({ blockId: block.id, reason: "already-created" });
      continue;
    }
    try {
      const session = await openAttendanceSession(user, {
        classroomId: classroom.id,
        groupId: block.groupId,
        title: block.subject,
        startsAt: block.startsAt,
        endsAt: block.endsAt,
        lateAfterMinutes: 10,
        timetableLessons: block.lessons,
        automatic: true,
      });
      knownSessions.push(session);
      opened.push({ sessionId: session.id, blockId: block.id });
    } catch (error) {
      skipped.push({
        blockId: block.id,
        reason: error?.message || "Could not open session",
      });
    }
  }
  return { teacherId: user.id, date, opened, skipped };
}
