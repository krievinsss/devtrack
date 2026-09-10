import test from 'node:test';
import assert from 'node:assert/strict';
import { cronAuthorized, runAttendanceCron } from './attendanceCron.js';

function setup() {
  const calls = [];
  const deps = {
    getGroups: async () => [],
    getUsers: async () => [{ id: 'a', role: 'teacher' }, { id: 'b', role: 'teacher' }, { id: 's', role: 'student' }],
    getCoreUserWithAccess: async id => ({ id, role: 'teacher', permissionKeys: ['attendance.manage_sessions'] }),
    getClassrooms: async () => [],
    closeExpiredAutomaticAttendance: async user => { assert.ok(user.permissionKeys.includes('attendance.manage_sessions')); calls.push('close:' + user.id); return []; },
    syncAutomaticAttendanceForTeacher: async user => { assert.ok(user.permissionKeys.includes('attendance.manage_sessions')); calls.push('open:' + user.id); return { teacherId: user.id, opened: [], skipped: [] }; },
  };
  return { deps, calls };
}
test('cookie-free cron resolves permissions and closes all teachers before opening', async () => {
  const { deps, calls } = setup();
  assert.equal((await runAttendanceCron(deps)).ok, true);
  assert.deepEqual(calls, ['close:a', 'close:b', 'open:a', 'open:b']);
});
test('revoked permissions are respected', async () => {
  const { deps, calls } = setup();
  deps.getCoreUserWithAccess = async id => ({ id, permissionKeys: [] });
  await runAttendanceCron(deps);
  assert.deepEqual(calls, []);
});
test('one teacher failure does not stop others or return false success', async () => {
  const { deps, calls } = setup();
  deps.getCoreUserWithAccess = async id => { if (id === 'a') throw new Error('Access unavailable'); return { id, permissionKeys: ['attendance.manage_sessions'] }; };
  assert.equal((await runAttendanceCron(deps)).ok, false);
  assert.deepEqual(calls, ['close:b', 'open:b']);
});
test('open and close failures are reported, already-created is normal', async () => {
  const { deps } = setup();
  deps.syncAutomaticAttendanceForTeacher = async () => ({ skipped: [{ reason: 'already-created' }] });
  assert.equal((await runAttendanceCron(deps)).ok, true);
  deps.syncAutomaticAttendanceForTeacher = async () => ({ skipped: [{ reason: 'Cannot open' }] });
  assert.equal((await runAttendanceCron(deps)).ok, false);
  deps.syncAutomaticAttendanceForTeacher = async () => ({ skipped: [] });
  deps.closeExpiredAutomaticAttendance = async () => [{ status: 'error' }];
  assert.equal((await runAttendanceCron(deps)).ok, false);
});
test('scheduler authentication fails closed without a configured secret', () => {
  assert.equal(cronAuthorized(undefined, null), false);
  assert.equal(cronAuthorized('', 'Bearer '), false);
  assert.equal(cronAuthorized('secret', 'Bearer wrong'), false);
  assert.equal(cronAuthorized('secret', 'Bearer secret'), true);
});
