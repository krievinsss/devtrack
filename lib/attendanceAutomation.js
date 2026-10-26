export function normalizeRoomName(value) {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return "";

  return raw
    .toLocaleLowerCase("lv-LV")
    .replace(/^(?:classroom|room|telpa|kabinets|auditorija)\s*/u, "")
    .replace(/^c[.\s-]*(?=\d)/u, "")
    .replace(/[\s._/\\-]+/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export function summarizeAttendanceAutomationRun(run = {}) {
  const results = Array.isArray(run.results) ? run.results : [];
  const openedCount = results.reduce(
    (total, item) => total + (Array.isArray(item.opened) ? item.opened.length : 0),
    0,
  );
  const closedCount = Array.isArray(run.closed) ? run.closed.length : 0;

  const resultSkips = results.flatMap((item) =>
    (Array.isArray(item.skipped) ? item.skipped : [])
      .filter((skip) => skip?.reason)
      .map((skip) => ({
        teacherId: item.teacherId || null,
        blockId: skip.blockId || null,
        reason: skip.reason,
      })),
  );
  const topLevelSkips = Array.isArray(run.skipped)
    ? run.skipped
        .filter((skip) => skip?.reason)
        .map((skip) => ({
          teacherId: skip.teacherId || null,
          blockId: skip.blockId || null,
          reason: skip.reason,
        }))
    : [];
  const skipReasons = [...resultSkips, ...topLevelSkips];
  const skippedCount = skipReasons.length;

  const errors = results.flatMap((item) => {
    if (!item.error) return [];
    return [
      {
        teacherId: item.teacherId || null,
        message: item.error,
      },
    ];
  });

  const harmlessSkipReason = (reason) => {
    const normalized = String(reason || "").trim().toLowerCase();
    return ["already-created", "already created", "already_created"].includes(normalized);
  };

  const hasFatalSkip = skipReasons.some(
    (skip) => skip?.reason && !harmlessSkipReason(skip.reason),
  );
  const inferredOk = !errors.length && !hasFatalSkip;
  const isOk = run.ok === undefined ? inferredOk : Boolean(run.ok);

  return {
    ok: isOk,
    ranAt: run.ranAt || null,
    durationMs: Number(run.durationMs || 0),
    openedCount,
    closedCount,
    skippedCount,
    errors,
    skipReasons,
    summary: `Opened ${openedCount}, closed ${closedCount}, skipped ${skippedCount}.`,
  };
}

export function classroomForTimetableRoom(room, classrooms = []) {
  const key = normalizeRoomName(room);
  if (!key) return null;
  return (
    classrooms.find(
      (classroom) =>
        classroom.active !== false && normalizeRoomName(classroom.name) === key,
    ) || null
  );
}

export function isTimetableBlockActive(block, now = new Date()) {
  const value = new Date(now).getTime();
  return (
    Number.isFinite(value) &&
    new Date(block.startsAt).getTime() <= value &&
    new Date(block.endsAt).getTime() > value
  );
}

export function sameScheduledSession(session, block, classroomId) {
  return (
    session.classroomId === classroomId &&
    session.groupId === block.groupId &&
    new Date(session.startsAt).getTime() === new Date(block.startsAt).getTime()
  );
}
