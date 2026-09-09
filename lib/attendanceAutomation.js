export function normalizeRoomName(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("lv-LV")
    .replace(/^(classroom|room|telpa|kabinets)\s*/u, "")
    .replace(/^c[.\s-]*(?=\d)/u, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
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
