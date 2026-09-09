import assert from "node:assert/strict";
import test from "node:test";
import {
  classroomForTimetableRoom,
  isTimetableBlockActive,
  normalizeRoomName,
  sameScheduledSession,
} from "./attendanceAutomation.js";

test("matches common timetable and DevTrack classroom spellings", () => {
  assert.equal(normalizeRoomName("c.110"), "110");
  assert.equal(normalizeRoomName("Room 110"), "110");
  assert.equal(
    classroomForTimetableRoom("C.110", [
      { id: "other", name: "205", active: true },
      { id: "room", name: "110", active: true },
    ]).id,
    "room",
  );
});

test("only treats the timetable block as active until its exact end", () => {
  const block = {
    startsAt: "2026-09-09T06:00:00.000Z",
    endsAt: "2026-09-09T07:20:00.000Z",
  };
  assert.equal(isTimetableBlockActive(block, "2026-09-09T06:00:00Z"), true);
  assert.equal(isTimetableBlockActive(block, "2026-09-09T07:19:59Z"), true);
  assert.equal(isTimetableBlockActive(block, "2026-09-09T07:20:00Z"), false);
});

test("recognizes an already created scheduled session", () => {
  const block = {
    groupId: "IPa24",
    startsAt: "2026-09-09T06:00:00.000Z",
  };
  assert.equal(
    sameScheduledSession(
      {
        classroomId: "room",
        groupId: "IPa24",
        startsAt: "2026-09-09T06:00:00.000Z",
      },
      block,
      "room",
    ),
    true,
  );
});
