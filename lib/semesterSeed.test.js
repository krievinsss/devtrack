import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSemesterSeed,
  mergeSeedDataset,
  mergeSeedMonitor,
} from "./semesterSeed.js";

test("generates six months of linked synthetic application data", () => {
  const seed = generateSemesterSeed({ to: "2026-03-31" });
  const { datasets, versionedEvents } = seed;
  const ids = new Set(datasets.users.map((user) => user.id));
  const projectIds = new Set(datasets.projects.map((project) => project.id));
  const assignmentIds = new Set(datasets.assignments.map((assignment) => assignment.id));

  assert.deepEqual(seed.window, { from: "2025-09-30", to: "2026-03-31" });
  assert.equal(seed.academicYear, "2025/2026");
  assert.ok(datasets.groups.every((group) => group.academicYear === seed.academicYear && group.name.endsWith("26")));
  assert.equal(datasets.users.length, 24);
  assert.equal(datasets.groups.length, 4);
  assert.equal(datasets.assignments.length, 24);
  assert.equal(datasets.projects.length, 120);
  assert.equal(datasets.summativeAssessments.length, 24);
  assert.equal(datasets.repositoryDemo && Object.keys(datasets.repositoryDemo).length, 120);
  assert.ok(datasets.attendanceAutomationMonitor.records.some((record) => record.status === "successful"));
  assert.ok(datasets.attendanceAutomationMonitor.records.some((record) => record.status === "no-op"));
  assert.ok(datasets.attendanceAutomationMonitor.records.every((record) =>
    record.status !== "failed" && record.skippedCount === 0 && record.skipReasons.length === 0,
  ));
  assert.ok(datasets.timetable.length > 0);
  assert.ok(datasets.users.every((user) => user.email.endsWith(".test")));
  assert.ok(datasets.users.every((user) => !user.passwordHash));
  assert.ok(datasets.projects.every((project) =>
    assignmentIds.has(project.assignmentId) && ids.has(project.studentId),
  ));
  assert.ok(datasets.commits.every((commit) => projectIds.has(commit.repositoryId)));
  assert.ok(datasets.summativeAssessments.every((event) =>
    assignmentIds.has(event.assignmentId) && event.results.length === 5,
  ));
  assert.ok(datasets.gamificationTransactions.every((transaction) => ids.has(transaction.studentId)));
  assert.ok(datasets.timetable.every((lesson) =>
    groupsContainName(datasets.groups, lesson.group) &&
    ["C110", "C120", "C210", "C220"].includes(lesson.room),
  ));
  assert.ok(versionedEvents.music.every((event) =>
    event.type !== "patch" || event.requestId.startsWith("seed_6m_"),
  ));
  assert.ok(versionedEvents.stackdev.every((event) =>
    event.question?.id?.startsWith("seed_6m_") || event.questionId?.startsWith("seed_6m_"),
  ));
  assert.ok(Object.values(datasets).flatMap((value) => Array.isArray(value) ? value : [])
    .every((item) => !item.createdAt || (
      new Date(item.createdAt) >= new Date(`${seed.window.from}T00:00:00.000Z`) &&
      new Date(item.createdAt) <= new Date(`${seed.window.to}T23:59:59.999Z`)
    )));
});

function groupsContainName(groups, name) {
  return groups.some((group) => group.name === name);
}

test("rejects malformed, impossible, and reversed dates", () => {
  assert.throws(() => generateSemesterSeed({ from: "2026-02-30", to: "2026-03-01" }), /Nederīgs datums/);
  assert.throws(() => generateSemesterSeed({ from: "2026-03-02", to: "2026-03-01" }), /pirms beigu/);
});

test("merges seed records idempotently and keeps non-seed records", () => {
  const original = [
    { id: "real_record", value: "preserve" },
    { id: "seed_6m_old", value: "old" },
  ];
  const generated = [{ id: "seed_6m_new", value: "new" }];
  const once = mergeSeedDataset(original, generated);
  assert.deepEqual(once, [
    { id: "real_record", value: "preserve" },
    { id: "seed_6m_new", value: "new" },
  ]);
  assert.deepEqual(mergeSeedDataset(once, generated), once);
});

test("monitor merging keeps non-seed history and caps results at 100", () => {
  const existing = {
    latest: null,
    records: Array.from({ length: 60 }, (_, index) => ({
      id: `real_${index}`,
      ranAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    })),
  };
  const seeded = {
    records: Array.from({ length: 60 }, (_, index) => ({
      id: `seed_6m_${index}`,
      ranAt: `2026-02-${String((index % 28) + 1).padStart(2, "0")}T10:00:00.000Z`,
    })),
  };
  const merged = mergeSeedMonitor(existing, seeded);
  assert.equal(merged.records.length, 100);
  assert.equal(merged.latest.id, merged.records[0].id);
  assert.ok(merged.records.some((record) => record.id.startsWith("real_")));
  assert.ok(merged.records.some((record) => record.id.startsWith("seed_6m_")));
});
