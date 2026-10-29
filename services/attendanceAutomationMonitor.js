import "server-only";
import { randomUUID } from "node:crypto";
import {
  attendanceBlocksFromTimetable,
  dateInRiga,
  timetableForUser,
} from "@/services/timetable";
import { getAttendanceDashboard } from "@/services/attendance";
import {
  closeExpiredAutomaticAttendance,
  getAutomaticAttendanceSessionIds,
  syncAutomaticAttendanceForTeacher,
} from "@/services/attendanceAutomation";
import { getClassroomsForAttendanceAutomation } from "@/services/classrooms";
import { getCoreUserWithAccess } from "@/services/coreDirectory";
import { getGroups } from "@/services/groups";
import { getUsers } from "@/services/users";
import {
  appendAttendanceAutomationRun,
  createAttendanceAutomationRunRecord,
  diagnoseAttendanceBlock,
  filterAttendanceAutomationHistory,
  friendlyAutomationReason,
  normalizeAttendanceAutomationMonitor,
} from "@/lib/attendanceAutomationMonitor";
import { classroomForTimetableRoom } from "@/lib/attendanceAutomation";
import { readJson, updateJson } from "@/lib/storage";

const HISTORY_STORE = "attendanceAutomationMonitor";

export class AttendanceAutomationTargetError extends Error {
  constructor() {
    super("Skolotājam nav atļauts vadīt apmeklējuma sesijas.");
    this.name = "AttendanceAutomationTargetError";
  }
}

export async function recordAttendanceAutomationRun(run, {
  trigger = "cron",
  durationMs = run.durationMs,
} = {}) {
  const record = createAttendanceAutomationRunRecord(run, {
    id: randomUUID(),
    trigger,
    durationMs,
  });
  await updateJson(HISTORY_STORE, { latest: null, records: [] }, (current) =>
    appendAttendanceAutomationRun(current, record),
  );
  return record;
}

export async function getAttendanceAutomationMonitor({
  teacherId = "",
  date = "",
  result = "",
  limit = 20,
  offset = 0,
} = {}) {
  const monitor = normalizeAttendanceAutomationMonitor(
    await readJson(HISTORY_STORE, null),
  );
  const latest = teacherId
    ? monitor.records.find((record) => record.teacherIds?.includes(teacherId)) || null
    : monitor.latest;
  const history = filterAttendanceAutomationHistory(monitor.records, {
    date,
    teacherId,
    result,
    limit,
    offset,
  });
  return { latest, history };
}

export async function getTodayAttendanceAutomationStatus({
  teacherId = "",
  now = new Date(),
} = {}) {
  const date = dateInRiga(now);
  const [groups, users, stored] = await Promise.all([
    getGroups(),
    getUsers(),
    readJson(HISTORY_STORE, null),
  ]);
  const monitor = normalizeAttendanceAutomationMonitor(stored);
  const lastCron = monitor.records.find((record) => record.trigger === "cron");
  const teachers = users.filter((candidate) =>
    candidate.active !== false &&
    ["teacher", "admin"].includes(candidate.role) &&
    (!teacherId || candidate.id === teacherId),
  );
  const lessons = [];
  const sources = [];

  for (let index = 0; index < teachers.length; index += 5) {
    const batch = await Promise.all(
      teachers.slice(index, index + 5).map((candidate) =>
        getTeacherAutomationStatus(candidate, { groups, date, now, lastCron }),
      ),
    );
    for (const result of batch) {
      if (result.source) sources.push(result.source);
      lessons.push(...result.lessons);
    }
  }

  return {
    date,
    timeZone: "Europe/Riga",
    lessons: lessons.sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt) ||
      a.teacherName.localeCompare(b.teacherName),
    ),
    sources,
    lastCronAt: lastCron?.ranAt || null,
    alert: lessons.some((lesson) => lesson.status === "error")
      ? "Vismaz vienai aktīvai stundai automātika nav savlaicīgi izpildījusies."
      : null,
  };
}

export async function recheckAttendanceAutomationLesson({
  teacherId,
  blockId,
  requester,
  now = new Date(),
}) {
  const [groups, candidate] = await Promise.all([
    getGroups(),
    getCoreUserWithAccess(teacherId),
  ]);
  if (!candidate || candidate.active === false ||
      !["teacher", "admin"].includes(candidate.role) ||
      !candidate.permissionKeys?.includes("attendance.manage_sessions") ||
      (requester?.platformRole !== "super_admin" &&
        candidate.schoolId !== requester?.schoolId))
    throw new AttendanceAutomationTargetError();

  const closed = await closeExpiredAutomaticAttendance(candidate, now);
  const classrooms = await getClassroomsForAttendanceAutomation(candidate);
  const result = await syncAutomaticAttendanceForTeacher(
    candidate,
    groups,
    classrooms,
    now,
    { blockId },
  );
  const run = {
    ok: !closed.some((item) => item.status === "error") &&
      !result.error &&
      !result.skipped.some((item) => item.reason !== "already-created"),
    ranAt: now.toISOString(),
    closed,
    results: [result],
  };
  const record = await recordAttendanceAutomationRun(run, { trigger: "manual-check" });
  return { record };
}

function fullName(user) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email ||
    user.id;
}

async function getTeacherAutomationStatus(candidate, { groups, date, now, lastCron }) {
  const fallbackName = fullName(candidate);
  let teacher;
  try {
    teacher = await getCoreUserWithAccess(candidate.id);
  } catch (error) {
    return {
      source: {
        teacherId: candidate.id,
        teacherName: fallbackName,
        status: "error",
        message: friendlyAutomationReason(error?.message),
      },
      lessons: [],
    };
  }
  if (!teacher || teacher.active === false ||
      !teacher.permissionKeys?.includes("attendance.manage_sessions"))
    return { source: null, lessons: [] };

  try {
    const [classrooms, timetable, dashboard] = await Promise.all([
      getClassroomsForAttendanceAutomation(teacher),
      timetableForUser(teacher, groups, date, { fresh: true }),
      getAttendanceDashboard(teacher, { historyLimit: 100 }),
    ]);
    if (timetable.error) {
      return {
        source: {
          teacherId: teacher.id,
          teacherName: fullName(teacher),
          status: "error",
          message: friendlyAutomationReason(timetable.error),
        },
        lessons: [],
      };
    }

    const sessions = [...dashboard.active, ...dashboard.history];
    const automaticSessions = await getAutomaticAttendanceSessionIds(teacher, sessions);
    const diagnosticSessions = sessions.map((session) => ({
      ...session,
      automatic: automaticSessions.has(session.id),
    }));
    const blocks = attendanceBlocksFromTimetable(
      timetable.lessons.filter((lesson) => lesson.date === date),
      groups,
      { includeUnlinked: true },
    );
    return {
      source: {
        teacherId: teacher.id,
        teacherName: fullName(teacher),
        status: timetable.partialError ? "warning" : "available",
        message: timetable.partialError
          ? friendlyAutomationReason(timetable.partialError)
          : null,
      },
      lessons: blocks.map((block) => {
        const runDetail = lastCron?.details?.find((detail) =>
          detail.teacherId === teacher.id &&
          (!detail.blockId || detail.blockId === block.id) &&
          ["error", "skipped"].includes(detail.action),
        ) || null;
        return diagnoseAttendanceBlock(
          { ...block, teacherId: teacher.id, teacherName: fullName(teacher) },
          {
            classroom: classroomForTimetableRoom(block.room, classrooms),
            groupId: block.groupId,
            sessions: diagnosticSessions,
            now,
            lastCronAt: lastCron?.ranAt || null,
            lastCronOutcome: {
              status: lastCron?.status || null,
              detail: runDetail,
            },
          },
        );
      }),
    };
  } catch (error) {
    return {
      source: {
        teacherId: teacher.id,
        teacherName: fullName(teacher),
        status: "error",
        message: friendlyAutomationReason(error?.message),
      },
      lessons: [],
    };
  }
}
