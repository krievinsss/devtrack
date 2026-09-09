import assert from "node:assert/strict";
import test from "node:test";
import {
  firstLessonOfOvertime,
  overtimeBlockNumber,
  overtimeLabel,
} from "./schoolPeriods.js";

test("maps pairs of timetable lessons to school overtime blocks", () => {
  assert.equal(overtimeBlockNumber(1), 1);
  assert.equal(overtimeBlockNumber(2), 1);
  assert.equal(overtimeBlockNumber(3), 2);
  assert.equal(overtimeBlockNumber(8), 4);
});

test("formats overtime blocks and maps them back to their first lesson", () => {
  assert.equal(overtimeLabel(5), "3. pārstunda");
  assert.equal(overtimeLabel(7, { short: true }), "4. PĀR");
  assert.equal(firstLessonOfOvertime(4), 7);
});
