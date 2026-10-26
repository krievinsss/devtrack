import assert from "node:assert/strict";
import test from "node:test";
import {
  classroomForTimetableRoom,
  isTimetableBlockActive,
  normalizeRoomName,
  sameScheduledSession,
  summarizeAttendanceAutomationRun,
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

test("summarizes automation status clearly for the admin monitor", () => {
  const run = summarizeAttendanceAutomationRun({
    ok: false,
    durationMs: 1840,
    ranAt: "2026-09-09T06:00:00.000Z",
    closed: [{ sessionId: "s1", status: "closed" }],
    results: [
      {
        teacherId: "t1",
        opened: [{ sessionId: "open-1", blockId: "b1" }],
        skipped: [
          { blockId: "b2", reason: "already-created" },
          { blockId: "b3", reason: "Room 110 is missing" },
        ],
      },
      { teacherId: "t2", error: "Failed to load timetable" },
    ],
  });

  assert.equal(run.ok, false);
  assert.equal(run.durationMs, 1840);
  assert.equal(run.openedCount, 1);
  assert.equal(run.closedCount, 1);
  assert.equal(run.skippedCount, 2);
  assert.equal(run.errors.length, 1);
  assert.equal(run.errors[0].message, "Failed to load timetable");
});

test("infers success when a run only has harmless already-created skips", () => {
  const run = summarizeAttendanceAutomationRun({
    durationMs: 400,
    results: [
      {
        teacherId: "t1",
        opened: [],
        skipped: [{ blockId: "b2", reason: "already-created" }],
      },
    ],
  });

  assert.equal(run.ok, true);
  assert.equal(run.skippedCount, 1);
  assert.equal(run.errors.length, 0);
});

test("accepts top-level skipped results without losing their reasons", () => {
  const run = summarizeAttendanceAutomationRun({
    skipped: [{ blockId: "b2", reason: "Already Created" }],
  });

  assert.equal(run.ok, true);
  assert.equal(run.skippedCount, 1);
  assert.equal(run.skipReasons[0].reason, "Already Created");
});
