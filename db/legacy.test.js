import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLegacyCore } from './legacy.js';

const input={
  ownerEmail:'toms.ricards@vtdt.edu.lv',
  school:{id:'school_vtdt',name:'VTDT',slug:'vtdt'},
  legacyUsers:[
    {id:'teacher_001',role:'teacher',firstName:'Toms',lastName:'Krieviņš',email:'TOMS.RICARDS@VTDT.EDU.LV',groupIds:['group_1'],passwordHash:'hash',githubUsername:'toms'},
    {id:'student_001',role:'student',firstName:'Anna',lastName:'Kalniņa',email:'anna@example.lv',groupIds:['group_1'],mustChangePassword:true}
  ],
  legacyGroups:[{id:'group_1',name:'IPa24',teacherIds:['teacher_001'],studentIds:['student_001'],deskplanGroupId:'44'}]
};

test('the configured owner becomes platform super admin and school admin',()=>{
  const result=prepareLegacyCore(input),owner=result.userRows.find(row=>row.id==='teacher_001'),membership=result.membershipRows.find(row=>row.userId==='teacher_001');
  assert.equal(owner.email,'toms.ricards@vtdt.edu.lv');
  assert.equal(owner.platformRole,'super_admin');
  assert.equal(owner.passwordHash,'hash');
  assert.equal(membership.role,'school_admin');
});

test('legacy integration fields are retained without duplicating credentials',()=>{
  const result=prepareLegacyCore(input),owner=result.userRows.find(row=>row.id==='teacher_001');
  assert.equal(owner.profile.githubUsername,'toms');
  assert.equal(owner.profile.passwordHash,undefined);
  assert.equal(result.groupRows[0].externalRefs.deskplanGroupId,'44');
});

test('group relations are merged without duplicates and preserve the lead teacher',()=>{
  const result=prepareLegacyCore(input);
  assert.deepEqual(result.relationSeeds,[
    {groupId:'group_1',userId:'student_001',relation:'student'},
    {groupId:'group_1',userId:'teacher_001',relation:'lead_teacher'}
  ]);
});

test('the importer refuses duplicate identities',()=>{
  assert.throws(()=>prepareLegacyCore({...input,legacyUsers:[...input.legacyUsers,{...input.legacyUsers[1],id:'student_002'}]}),/Duplicate user email/);
});
