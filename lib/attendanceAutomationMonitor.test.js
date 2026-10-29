import assert from "node:assert/strict";
import test from "node:test";
import {
  appendAttendanceAutomationRun,
  attendanceAutomationMonitorQuerySchema,
  createAttendanceAutomationRunRecord,
  diagnoseAttendanceBlock,
  filterAttendanceAutomationHistory,
  friendlyAutomationReason,
  normalizeAttendanceAutomationMonitor,
} from "./attendanceAutomationMonitor.js";

const block = {
  id: "lesson-1",
  teacherId: "teacher-1",
  teacherName: "Anna Skolotāja",
  group: "IPa24",
  groupId: "group-1",
  room: "110",
  subject: "Programmēšana",
  startsAt: "2026-10-29T08:00:00.000Z",
  endsAt: "2026-10-29T09:00:00.000Z",
};

test("monitor query accepts default empty date and rejects malformed filters", () => {
  assert.deepEqual(attendanceAutomationMonitorQuerySchema.parse({}), {
    date: "",
    teacherId: "",
    limit: 20,
    offset: 0,
  });
  assert.equal(attendanceAutomationMonitorQuerySchema.parse({
    date: "2026-10-29",
    result: "failed",
  }).date, "2026-10-29");
  assert.throws(() => attendanceAutomationMonitorQuerySchema.parse({ date: "yesterday" }));
});

test("monitor run records distinguish successful, failed and no-op runs", () => {
  const noOp = createAttendanceAutomationRunRecord(
    {
      ok: true,
      ranAt: "2026-10-29T08:00:00Z",
      results: [{ teacherId: "teacher-1", opened: [], skipped: [] }],
    },
    { id: "no-op" },
  );
  assert.equal(noOp.status, "no-op");
  assert.deepEqual(noOp.teacherIds, ["teacher-1"]);
  assert.equal(noOp.details[0].action, "no-op");
  assert.equal(
    createAttendanceAutomationRunRecord(
      { ok: true, ranAt: "2026-10-29T08:00:00Z", results: [{ opened: [{ blockId: "lesson-1" }] }] },
      { id: "success" },
    ).status,
    "successful",
  );
  assert.equal(
    createAttendanceAutomationRunRecord(
      { ok: false, ranAt: "2026-10-29T08:00:00Z", results: [{ error: "DB host secret" }] },
      { id: "failed" },
    ).status,
    "failed",
  );
});

test("monitor details replace raw errors with safe explanations", () => {
  const record = createAttendanceAutomationRunRecord({
    ok: false,
    ranAt: "2026-10-29T08:00:00Z",
    results: [{ teacherId: "teacher-1", error: "postgres://private-host/db?password=secret" }],
  });
  assert.equal(record.errors[0].message, "Automātikas darbība neizdevās. Pārbaudiet stundu un telpas konfigurāciju.");
  assert.equal(JSON.stringify(record).includes("secret"), false);
  assert.equal(friendlyAutomationReason("Timetable source unavailable"), "Stundu saraksta avots nav pieejams.");
});

test("history is retained to a fixed maximum and legacy monitor values migrate", () => {
  let monitor = { latest: null, records: [] };
  for (let index = 0; index < 105; index += 1) {
    monitor = appendAttendanceAutomationRun(monitor, {
      id: `run-${index}`,
      ranAt: new Date(Date.UTC(2026, 9, 29, 8, index)).toISOString(),
      teacherIds: [],
    });
  }
  assert.equal(monitor.records.length, 100);
  assert.equal(monitor.latest.id, "run-104");

  const legacy = normalizeAttendanceAutomationMonitor({
    ok: true,
    ranAt: "2026-10-29T08:00:00Z",
    durationMs: 200,
  });
  assert.equal(legacy.latest.trigger, "cron");
  assert.equal(legacy.records.length, 1);
});

test("history filters by Riga calendar day, teacher and result with bounded pagination", () => {
  const records = [
    { id: "riga-day", ranAt: "2026-10-28T22:30:00Z", teacherIds: ["teacher-1"], status: "failed" },
    { id: "other-teacher", ranAt: "2026-10-29T08:00:00Z", teacherIds: ["teacher-2"], status: "failed" },
    { id: "other-result", ranAt: "2026-10-29T08:01:00Z", teacherIds: ["teacher-1"], status: "successful" },
  ];
  const result = filterAttendanceAutomationHistory(records, {
    date: "2026-10-29",
    teacherId: "teacher-1",
    result: "failed",
    limit: 500,
  });
  assert.equal(result.total, 1);
  assert.equal(result.records[0].id, "riga-day");
  assert.equal(result.limit, 20);
});

test("diagnostics identify missing links, active stale cron, planned, opened and closed lessons", () => {
  const base = {
    classroom: { id: "room-1" },
    now: "2026-10-29T08:30:00Z",
    lastCronAt: "2026-10-29T08:00:00Z",
  };
  assert.equal(diagnoseAttendanceBlock(block, { ...base, groupId: null }).status, "skipped");
  assert.equal(diagnoseAttendanceBlock(block, { ...base, classroom: null }).status, "skipped");
  assert.equal(diagnoseAttendanceBlock(block, {
    ...base,
    lastCronAt: null,
  }).status, "error");
  assert.equal(diagnoseAttendanceBlock(block, {
    ...base,
    lastCronOutcome: {
      status: "failed",
      detail: { action: "error", message: "Stundu saraksta avots nav pieejams." },
    },
  }).status, "error");
  assert.equal(diagnoseAttendanceBlock(block, {
    ...base,
    now: "2026-10-29T07:30:00Z",
  }).status, "planned");
  assert.equal(diagnoseAttendanceBlock(block, {
    ...base,
    sessions: [{
      id: "session-open",
      classroomId: "room-1",
      groupId: "group-1",
      startsAt: block.startsAt,
      status: "open",
    }],
  }).status, "opened");
  assert.equal(diagnoseAttendanceBlock(block, {
    ...base,
    sessions: [{
      id: "session-closed",
      classroomId: "room-1",
      groupId: "group-1",
      startsAt: block.startsAt,
      status: "closed",
    }],
  }).status, "closed");
  assert.match(diagnoseAttendanceBlock(block, {
    ...base,
    sessions: [{
      id: "session-manual",
      classroomId: "manual-room",
      groupId: "group-1",
      startsAt: block.startsAt,
      status: "open",
      automatic: false,
    }],
  }).reason, /manuāli/u);
});

test("diagnostics respect the exact lesson end time", () => {
  const statusAtEnd = diagnoseAttendanceBlock(block, {
    classroom: { id: "room-1" },
    now: block.endsAt,
    lastCronAt: block.endsAt,
  });
  assert.equal(statusAtEnd.status, "skipped");
  assert.match(statusAtEnd.reason, /netika atvērta/u);
});
