import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStaffAccess } from './staffAccess.js';

test('teacher access cannot enable administration and ignores permissions from disabled modules',()=>{
  const access=normalizeStaffAccess({
    schoolRole:'teacher',
    moduleKeys:['grades','administration'],
    permissionKeys:['grades.view_assigned','grades.manage','administration.manage_access']
  });
  assert.deepEqual(access.moduleKeys,['grades']);
  assert.deepEqual(access.permissionKeys,['grades.view_assigned','grades.manage']);
  assert.equal(access.moduleAccess.find(row=>row.moduleKey==='administration').enabled,false);
});

test('permission selections produce minimal allow and deny overrides',()=>{
  const access=normalizeStaffAccess({
    schoolRole:'teacher',
    moduleKeys:['classrooms','grades'],
    permissionKeys:['classrooms.view','classrooms.manage','grades.view_assigned']
  });
  assert.deepEqual(access.permissionOverrides,[
    {permissionKey:'classrooms.manage',effect:'allow'},
    {permissionKey:'grades.manage',effect:'deny'}
  ]);
});

test('school disabled modules cannot be restored by staff access',()=>{
  const access=normalizeStaffAccess({
    schoolRole:'teacher',
    moduleKeys:['timetable','github'],
    permissionKeys:['timetable.view','github.review'],
    schoolOverrides:[{moduleKey:'github',enabled:false}]
  });
  assert.deepEqual(access.moduleKeys,['timetable']);
  assert.deepEqual(access.permissionKeys,['timetable.view']);
});
