import assert from "node:assert/strict";
import test from "node:test";
import {
  automaticallyOpenedSessionIds,
  classroomForTimetableRoom,
  isTimetableBlockActive,
  normalizeRoomName,
  reconcileAttendanceBlocks,
  sameScheduledSession,
  summarizeAttendanceAutomationRun,
} from "./attendanceAutomation.js";

test("matches common timetable and DevTrack classroom spellings", () => {
  assert.equal(normalizeRoomName("c.110"), "110");
  assert.equal(normalizeRoomName("Room 110"), "110");
  assert.equal(normalizeRoomName("C110"), normalizeRoomName("C.110"));
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
        classroomId: "manual-room",
        groupId: "IPa24",
        startsAt: "2026-09-09T06:00:00.000Z",
      },
      block,
    ),
    true,
  );
});

test("rechecking the same active block does not open a duplicate session", async () => {
  const block = {
    id: "lesson-1",
    groupId: "group-1",
    startsAt: "2026-09-09T06:00:00.000Z",
    group: "IPa24",
    room: "C.110",
    subject: "Programming",
  };
  const classrooms = [{ id: "room-1", name: "110", active: true }];
  const knownSessions = [];
  let openCount = 0;
  const options = {
    user: { id: "teacher-1" },
    blocks: [block],
    classrooms,
    knownSessions,
    openSession: async () => {
      openCount += 1;
      return {
        id: "session-1",
        classroomId: "room-1",
        groupId: "group-1",
        startsAt: block.startsAt,
      };
    },
  };

  const first = await reconcileAttendanceBlocks(options);
  const second = await reconcileAttendanceBlocks(options);

  assert.equal(openCount, 1);
  assert.equal(first.opened.length, 1);
  assert.deepEqual(second.skipped, [
    { blockId: "lesson-1", reason: "already-created" },
  ]);
});

test("reports missing group and classroom links without trying to open sessions", async () => {
  let openCount = 0;
  const result = await reconcileAttendanceBlocks({
    user: { id: "teacher-1" },
    blocks: [
      { id: "missing-group", group: "IPa24", room: "110" },
      { id: "missing-room", groupId: "group-1", group: "IPa24", room: "205" },
    ],
    classrooms: [{ id: "room-1", name: "110", active: true }],
    knownSessions: [],
    openSession: async () => { openCount += 1; },
  });

  assert.equal(openCount, 0);
  assert.equal(result.opened.length, 0);
  assert.match(result.skipped[0].reason, /not linked/u);
  assert.match(result.skipped[1].reason, /not found/u);
});

test("automatic closure only selects sessions opened by the automation", () => {
  const sessions = [{ id: "auto" }, { id: "manual" }];
  const auditRows = [
    {
      entityId: "auto",
      action: "attendance.session_opened",
      metadata: { automatic: true },
    },
    {
      entityId: "manual",
      action: "attendance.session_opened",
      metadata: { automatic: false },
    },
  ];
  assert.deepEqual([...automaticallyOpenedSessionIds(sessions, auditRows)], ["auto"]);
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

test("counts only closed sessions and exposes close failures as errors", () => {
  const run = summarizeAttendanceAutomationRun({
    ok: false,
    closed: [
      { sessionId: "closed-1", status: "closed" },
      { sessionId: "failed-1", status: "error", teacherId: "t1", error: "Could not close session" },
    ],
  });
  assert.equal(run.closedCount, 1);
  assert.equal(run.errors.length, 1);
  assert.equal(run.errors[0].teacherId, "t1");
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
