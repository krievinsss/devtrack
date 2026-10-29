import { z } from "zod";
import {
  sameScheduledSession,
  summarizeAttendanceAutomationRun,
} from "./attendanceAutomation.js";

export const ATTENDANCE_AUTOMATION_HISTORY_LIMIT = 100;
export const ATTENDANCE_AUTOMATION_HISTORY_PAGE_SIZE = 20;
export const ATTENDANCE_AUTOMATION_STALE_MINUTES = 15;

export const attendanceAutomationMonitorQuerySchema = z.object({
  date: z.union([
    z.literal(""),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ]).optional().default(""),
  teacherId: z.string().max(200).optional().default(""),
  result: z.enum(["successful", "failed", "no-op"]).optional(),
  limit: z.coerce.number().int().min(1).max(20).optional().default(20),
  offset: z.coerce.number().int().min(0).max(10000).optional().default(0),
});

export function createAttendanceAutomationRunRecord(
  run,
  { id, trigger = "cron", durationMs = run.durationMs } = {},
) {
  const summary = summarizeAttendanceAutomationRun({ ...run, durationMs });
  const details = [
    ...(Array.isArray(run.closed) ? run.closed : []).map((item) => ({
      action: item.status === "error" ? "error" : "closed",
      teacherId: item.teacherId || null,
      sessionId: item.sessionId || null,
      message: item.status === "error" ? "Neizdevās aizvērt automātisko stundu." : null,
    })),
    ...(Array.isArray(run.results) ? run.results : []).flatMap((item) => {
      const actions = [
        ...(Array.isArray(item.opened) ? item.opened : []).map((opened) => ({
          action: "opened",
          teacherId: item.teacherId || null,
          blockId: opened.blockId || null,
          sessionId: opened.sessionId || null,
        })),
        ...(Array.isArray(item.skipped) ? item.skipped : []).map((skipped) => ({
          action: "skipped",
          teacherId: item.teacherId || null,
          blockId: skipped.blockId || null,
          message: friendlyAutomationReason(skipped.reason),
        })),
        ...(item.error
          ? [{
            action: "error",
            teacherId: item.teacherId || null,
            message: friendlyAutomationReason(item.error),
          }]
          : []),
      ];
      return actions.length
        ? actions
        : [{
            action: "no-op",
            teacherId: item.teacherId || null,
            message: "Izpildē netika atrasta atverama stunda.",
          }];
    }),
  ];
  if (!details.length && summary.ok && !summary.openedCount && !summary.closedCount) {
    details.push({
      action: "no-op",
      teacherId: null,
      message: run.eligibleTeacherCount === 0
        ? "Nav atrasts aktīvs skolotājs ar apmeklējuma piekļuvi."
        : "Šajā izpildē nebija atveramu stundu.",
    });
  }
  const errors = summary.errors.map((item) => ({
    teacherId: item.teacherId,
    message: friendlyAutomationReason(item.message),
  }));
  const status = !summary.ok
    ? "failed"
    : summary.openedCount || summary.closedCount
      ? "successful"
      : "no-op";

  return {
    id: id || `attendance-${Date.now()}`,
    ranAt: summary.ranAt || new Date().toISOString(),
    trigger,
    status,
    ok: summary.ok,
    durationMs: summary.durationMs,
    openedCount: summary.openedCount,
    closedCount: summary.closedCount,
    skippedCount: summary.skippedCount,
    errors,
    skipReasons: summary.skipReasons.map((item) => ({
      teacherId: item.teacherId,
      blockId: item.blockId,
      reason: friendlyAutomationReason(item.reason),
    })),
    details,
    teacherIds: [...new Set([
      ...details.map((item) => item.teacherId),
      ...(Array.isArray(run.results) ? run.results.map((item) => item.teacherId) : []),
      ...(Array.isArray(run.closed) ? run.closed.map((item) => item.teacherId) : []),
    ].filter(Boolean))],
    summary: summary.summary,
  };
}

export function normalizeAttendanceAutomationMonitor(value) {
  if (Array.isArray(value?.records))
    return {
      latest: value.latest || value.records[0] || null,
      records: value.records.slice(0, ATTENDANCE_AUTOMATION_HISTORY_LIMIT),
    };
  if (!value?.ranAt) return { latest: null, records: [] };

  const legacyRecord = {
    id: `legacy-${value.ranAt}`,
    ranAt: value.ranAt,
    trigger: "cron",
    status: !value.ok
      ? "failed"
      : Number(value.openedCount || 0) || Number(value.closedCount || 0)
        ? "successful"
        : "no-op",
    ok: Boolean(value.ok),
    durationMs: Number(value.durationMs || 0),
    openedCount: Number(value.openedCount || 0),
    closedCount: Number(value.closedCount || 0),
    skippedCount: Number(value.skippedCount || 0),
    errors: Array.isArray(value.errors)
      ? value.errors.map((item) => ({
          teacherId: item.teacherId || null,
          message: friendlyAutomationReason(item.message),
        }))
      : [],
    skipReasons: Array.isArray(value.skipReasons)
      ? value.skipReasons.map((item) => ({
          teacherId: item.teacherId || null,
          blockId: item.blockId || null,
          reason: friendlyAutomationReason(item.reason),
        }))
      : [],
    details: [],
    teacherIds: [],
    summary: String(value.summary || ""),
  };
  return { latest: legacyRecord, records: [legacyRecord] };
}

export function appendAttendanceAutomationRun(monitor, record) {
  const current = normalizeAttendanceAutomationMonitor(monitor);
  const records = [
    record,
    ...current.records.filter((item) => item.id !== record.id),
  ].slice(0, ATTENDANCE_AUTOMATION_HISTORY_LIMIT);
  return { latest: record, records };
}

export function filterAttendanceAutomationHistory(records, {
  date = "",
  teacherId = "",
  result = "",
  limit = ATTENDANCE_AUTOMATION_HISTORY_PAGE_SIZE,
  offset = 0,
} = {}) {
  const filtered = (Array.isArray(records) ? records : []).filter((record) => {
    if (date && rigaDate(record.ranAt) !== date) return false;
    if (teacherId && !record.teacherIds?.includes(teacherId)) return false;
    if (result && record.status !== result) return false;
    return true;
  });
  const safeLimit = Math.max(1, Math.min(ATTENDANCE_AUTOMATION_HISTORY_PAGE_SIZE, Number(limit) || ATTENDANCE_AUTOMATION_HISTORY_PAGE_SIZE));
  const safeOffset = Math.max(0, Number(offset) || 0);
  return {
    total: filtered.length,
    records: filtered.slice(safeOffset, safeOffset + safeLimit),
    limit: safeLimit,
    offset: safeOffset,
  };
}

export function diagnoseAttendanceBlock(block, {
  classroom = null,
  groupId = block.groupId || null,
  sessions = [],
  now = new Date(),
  lastCronAt = null,
  lastCronOutcome = null,
  staleAfterMinutes = ATTENDANCE_AUTOMATION_STALE_MINUTES,
} = {}) {
  const lesson = {
    id: block.id,
    teacherId: block.teacherId || null,
    teacherName: block.teacherName || "Nav zināms",
    group: block.group || "Nav norādīta",
    groupId,
    room: block.room || "Nav norādīta",
    subject: block.subject || "Stunda",
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    sessionId: null,
    status: "planned",
    reason: null,
    recheckable: false,
  };
  const currentTime = new Date(now).getTime();
  const start = new Date(block.startsAt).getTime();
  const end = new Date(block.endsAt).getTime();
  const active = Number.isFinite(currentTime) &&
    start <= currentTime &&
    end > currentTime;

  if (!groupId) {
    lesson.status = "skipped";
    lesson.reason = "Stundu saraksta grupa nav sasaistīta ar DevTrack grupu.";
    lesson.recheckable = active;
    return lesson;
  }
  if (!classroom) {
    lesson.status = "skipped";
    lesson.reason = block.room
      ? `DevTrack telpa “${block.room}” nav atrasta.`
      : "Stundu sarakstā nav norādīta telpa.";
    lesson.recheckable = active;
    return lesson;
  }

  const session = sessions.find((item) =>
    item.groupId === groupId &&
    sameScheduledSession(item, { ...block, groupId }),
  );
  if (session) {
    lesson.sessionId = session.id;
    lesson.status = session.status === "open"
      ? "opened"
      : session.status === "closed"
        ? "closed"
        : "skipped";
    if (session.status === "cancelled")
      lesson.reason = "Stunda tika atcelta; automātika to nemaina.";
    else if (session.automatic === false)
      lesson.reason = session.status === "open"
        ? "Sesija atvērta manuāli; automātika to nemaina."
        : "Sesija aizvērta manuāli; automātika šo izmaiņu saglabā.";
    return lesson;
  }

  if (currentTime >= end) {
    lesson.status = "skipped";
    lesson.reason = "Stundas laikā sesija netika atvērta.";
  } else if (currentTime >= start) {
    if (lastCronOutcome?.detail?.action === "error") {
      lesson.status = "error";
      lesson.reason = lastCronOutcome.detail.message;
      lesson.recheckable = true;
      return lesson;
    }
    if (lastCronOutcome?.detail?.action === "skipped") {
      lesson.status = "skipped";
      lesson.reason = lastCronOutcome.detail.message;
      return lesson;
    }
    if (lastCronOutcome?.status === "failed") {
      lesson.status = "error";
      lesson.reason = "Pēdējā automātikas izpilde neizdevās.";
      lesson.recheckable = true;
      return lesson;
    }
    const lastRun = lastCronAt ? new Date(lastCronAt).getTime() : NaN;
    const stale = !Number.isFinite(lastRun) ||
      currentTime - lastRun > staleAfterMinutes * 60 * 1000;
    if (stale) {
      lesson.status = "error";
      lesson.recheckable = true;
      lesson.reason = Number.isFinite(lastRun)
        ? `Automātika nav izpildījusies ${Math.floor((currentTime - lastRun) / 60000)} minūtes.`
        : "Cron izpilde vēl nav reģistrēta.";
    }
  }
  return lesson;
}

export function friendlyAutomationReason(value) {
  const reason = String(value || "").trim();
  const normalized = reason.toLowerCase();
  if (!reason) return "Nezināms automātikas iemesls.";
  if (["already-created", "already created", "already_created"].includes(normalized))
    return "Šai stundai sesija jau pastāv.";
  if (normalized.includes("classroom") || normalized.includes("telp"))
    return "DevTrack telpa nav atrasta vai nav norādīta.";
  if (normalized.includes("group") || normalized.includes("grup"))
    return "Stundu saraksta grupa nav sasaistīta ar DevTrack grupu.";
  if (normalized.includes("timetable") || normalized.includes("schedule"))
    return "Stundu saraksta avots nav pieejams.";
  if (normalized.includes("access") || normalized.includes("permission"))
    return "Skolotājam nav atļaujas vadīt apmeklējuma sesijas.";
  if (normalized.includes("timeout") || normalized.includes("too long"))
    return "Stundu saraksta avots neatbildēja noteiktajā laikā.";
  return "Automātikas darbība neizdevās. Pārbaudiet stundu un telpas konfigurāciju.";
}

function rigaDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Riga",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
