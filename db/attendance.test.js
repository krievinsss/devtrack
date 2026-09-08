import test from 'node:test';
import assert from 'node:assert/strict';
import { attendanceMinutesLate,attendanceStatus,attendanceSummary,sessionWindow } from '../lib/attendance.js';

test('check-in stays present through the configured grace period',()=>{
  const startsAt='2026-09-08T06:00:00.000Z';
  assert.equal(attendanceStatus({startsAt,lateAfterMinutes:10,checkedInAt:'2026-09-08T06:10:00.000Z'}),'present');
  assert.equal(attendanceStatus({startsAt,lateAfterMinutes:10,checkedInAt:'2026-09-08T06:10:01.000Z'}),'late');
});

test('late minutes and summary are deterministic',()=>{
  assert.equal(attendanceMinutesLate({startsAt:'2026-09-08T06:00:00Z',checkedInAt:'2026-09-08T06:14:59Z'}),14);
  assert.deepEqual(attendanceSummary([{status:'present'},{status:'late'},{status:'absent'},{status:'excused'}]),{total:4,present:1,late:1,absent:1,excused:1,attended:2,percentage:50});
});

test('session window distinguishes upcoming, active and ended',()=>{
  const window={startsAt:'2026-09-08T06:00:00Z',endsAt:'2026-09-08T07:00:00Z'};
  assert.equal(sessionWindow({...window,now:'2026-09-08T05:59:59Z'}),'upcoming');
  assert.equal(sessionWindow({...window,now:'2026-09-08T06:30:00Z'}),'active');
  assert.equal(sessionWindow({...window,now:'2026-09-08T07:00:01Z'}),'ended');
});
