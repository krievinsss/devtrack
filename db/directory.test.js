import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyAccess,legacyUserProfile,materializeDirectory } from './directory.js';
import { MODULE_CATALOG,PERMISSION_CATALOG } from './catalog.js';

test('Neon directory rows preserve legacy profile fields without allowing core overrides',()=>{
  const result=materializeDirectory({
    memberRows:[{id:'teacher_1',email:'toms@example.lv',firstName:'Toms',lastName:'Krieviņš',passwordHash:'hash',platformRole:'super_admin',active:true,mustChangePassword:false,profile:{githubUsername:'toms',role:'student',email:'wrong@example.lv'},createdAt:new Date('2026-01-01T00:00:00Z'),updatedAt:new Date('2026-01-02T00:00:00Z'),membershipId:'membership_1',membershipStatus:'active',schoolRole:'school_admin',schoolId:'school_vtdt'}],
    groupRows:[{id:'group_1',schoolId:'school_vtdt',name:'IPa24',academicYear:'2026',active:true,externalRefs:{deskplanGroupId:'44'},createdAt:new Date('2026-01-01T00:00:00Z'),updatedAt:new Date('2026-01-02T00:00:00Z')}],
    relationRows:[{groupId:'group_1',userId:'teacher_1',relation:'lead_teacher'}]
  });
  assert.equal(result.users[0].role,'admin');
  assert.equal(result.users[0].email,'toms@example.lv');
  assert.equal(result.users[0].githubUsername,'toms');
  assert.deepEqual(result.users[0].groupIds,['group_1']);
  assert.deepEqual(result.groups[0].teacherIds,['teacher_1']);
  assert.equal(result.groups[0].deskplanGroupId,'44');
});

test('inactive memberships cannot materialize as active users',()=>{
  const result=materializeDirectory({memberRows:[{id:'student_1',email:'student@example.lv',firstName:'A',lastName:'B',passwordHash:null,platformRole:'user',active:true,mustChangePassword:false,profile:{},createdAt:new Date(),updatedAt:new Date(),membershipId:'membership_1',membershipStatus:'suspended',schoolRole:'student',schoolId:'school_vtdt'}]});
  assert.equal(result.users[0].active,false);
});

test('legacy profile extraction never duplicates credentials or membership fields',()=>{
  assert.deepEqual(legacyUserProfile({id:'student_1',email:'student@example.lv',passwordHash:'secret',groupIds:['group_1'],githubUsername:'student'}),{githubUsername:'student'});
});

test('legacy teachers retain their current full access before the Neon cutover',()=>{
  const access=legacyAccess({role:'teacher'});
  assert.equal(access.moduleKeys.length,MODULE_CATALOG.length);
  assert.equal(access.permissionKeys.length,PERMISSION_CATALOG.length);
});
