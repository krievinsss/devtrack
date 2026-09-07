import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAccess,resolveModuleKeys } from './access.js';
import { MODULE_CATALOG,PERMISSION_CATALOG } from './catalog.js';

test('a general teacher receives only the common classroom modules by default',()=>{
  assert.deepEqual(resolveModuleKeys({schoolRole:'teacher'}),['timetable','attendance','classrooms','groups']);
});

test('a teacher can receive programming modules without changing their role',()=>{
  const moduleKeys=resolveModuleKeys({schoolRole:'teacher',membershipOverrides:[{moduleKey:'github',enabled:true},{moduleKey:'stackdev',enabled:true}]});
  assert.equal(moduleKeys.includes('github'),true);
  assert.equal(moduleKeys.includes('stackdev'),true);
});

test('a school-level disable cannot be bypassed by a membership override',()=>{
  const moduleKeys=resolveModuleKeys({schoolRole:'teacher',schoolOverrides:[{moduleKey:'github',enabled:false}],membershipOverrides:[{moduleKey:'github',enabled:true}]});
  assert.equal(moduleKeys.includes('github'),false);
});

test('permissions are limited to enabled modules and honor explicit denies',()=>{
  const access=resolveAccess({schoolRole:'teacher',membershipOverrides:[{moduleKey:'grades',enabled:true}],permissionOverrides:[{permissionKey:'grades.manage',effect:'deny'}]});
  assert.equal(access.can('attendance.manage_sessions'),true);
  assert.equal(access.can('grades.manage'),false);
  assert.equal(access.can('github.review'),false);
});

test('a super admin receives every active module and its permissions',()=>{
  const access=resolveAccess({platformRole:'super_admin'});
  assert.equal(access.moduleKeys.length,MODULE_CATALOG.length);
  assert.equal(access.permissionKeys.length,PERMISSION_CATALOG.length);
});
