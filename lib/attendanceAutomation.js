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
  const closed = Array.isArray(run.closed) ? run.closed : [];
  const closedCount = closed.filter((item) => item?.status !== "error").length;

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
  const skippedCount =
    results.reduce(
      (total, item) => total + (Array.isArray(item.skipped) ? item.skipped.length : 0),
      0,
    ) + (Array.isArray(run.skipped) ? run.skipped.length : 0);

  const errors = [
    ...closed.flatMap((item) =>
      item?.status === "error"
        ? [{
            teacherId: item.teacherId || null,
            message: item.error || "Could not close attendance session",
          }]
        : [],
    ),
    ...results.flatMap((item) => {
      if (!item.error) return [];
      return [
        {
          teacherId: item.teacherId || null,
          message: item.error,
        },
      ];
    }),
  ];

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
    summary: `Atvērtas ${openedCount}, aizvērtas ${closedCount}, izlaistas ${skippedCount}.`,
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

export function sameScheduledSession(session, block) {
  return (
    session.groupId === block.groupId &&
    new Date(session.startsAt).getTime() === new Date(block.startsAt).getTime()
  );
}

export async function reconcileAttendanceBlocks({
  user,
  blocks,
  classrooms,
  knownSessions,
  openSession,
}) {
  const opened = [];
  const skipped = [];

  for (const block of blocks) {
    if (!block.groupId) {
      skipped.push({
        blockId: block.id,
        reason: `Timetable group "${block.group}" is not linked to a DevTrack group`,
      });
      continue;
    }
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
        sameScheduledSession(session, block),
      )
    ) {
      skipped.push({ blockId: block.id, reason: "already-created" });
      continue;
    }
    try {
      const session = await openSession(user, block, classroom);
      knownSessions.push(session);
      opened.push({ sessionId: session.id, blockId: block.id });
    } catch (error) {
      skipped.push({
        blockId: block.id,
        reason: error?.message || "Could not open session",
      });
    }
  }
  return { opened, skipped };
}

export function automaticallyOpenedSessionIds(sessions, auditRows) {
  const ids = new Set(sessions.map((session) => session.id));
  return new Set(
    auditRows
      .filter((row) =>
        ids.has(row.entityId) &&
        row.action === "attendance.session_opened" &&
        row.metadata?.automatic === true,
      )
      .map((row) => row.entityId),
  );
}
