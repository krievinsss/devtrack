import test from "node:test";
import assert from "node:assert/strict";
import {
  accessibleProgressGroups,
  progressStudentNavigation,
} from "./studentProgress.js";

const groups = [
  { id: "group-a", name: "Group A" },
  { id: "group-b", name: "Group B" },
];

test("teachers only see their assigned progress groups", () => {
  assert.deepEqual(
    accessibleProgressGroups(
      { role: "teacher", groupIds: ["group-b"] },
      groups,
    ),
    [groups[1]],
  );
});

test("school admins see all progress groups", () => {
  assert.deepEqual(
    accessibleProgressGroups({ role: "admin" }, groups),
    groups,
  );
  assert.deepEqual(
    accessibleProgressGroups({ role: "teacher", platformRole: "super_admin" }, groups),
    groups,
  );
});

test("students and unauthenticated users do not get progress groups", () => {
  assert.deepEqual(accessibleProgressGroups({ role: "student" }, groups), []);
  assert.deepEqual(accessibleProgressGroups(null, groups), []);
});

test("progress navigation cannot include students outside the selected roster", () => {
  assert.deepEqual(progressStudentNavigation(["a", "b", "c"], "b"), {
    previousStudentId: "a",
    nextStudentId: "c",
  });
  assert.deepEqual(progressStudentNavigation(["a", "b", "c"], "other"), {
    previousStudentId: null,
    nextStudentId: null,
  });
});