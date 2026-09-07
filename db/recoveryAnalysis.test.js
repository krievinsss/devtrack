import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeCoreRecovery } from './recoveryAnalysis.js';

const base={
  groups:[{id:'group_ok',name:'IPa24'}],
  users:[
    {id:'teacher_1',role:'admin',firstName:'Toms',lastName:'Krieviņš',email:'teacher@example.lv',passwordHash:'never-return-this'},
    {id:'student_1',role:'student',firstName:'Anna',lastName:'Bērziņa',email:'anna@example.lv',passwordHash:'never-return-this'}
  ],
  assignments:[{id:'assignment_ok',groupId:'group_ok',title:'Healthy'},{id:'assignment_lost',groupId:'group_lost',teacherId:'teacher_1',title:'Weather App',status:'published'}],
  projects:[{id:'project_lost',assignmentId:'assignment_lost',studentId:'student_1',name:'Weather App',status:'In progress',progress:40,githubOwner:'anna',githubRepo:'weather'}],
  commits:[{repositoryId:'project_lost',sha:'abc',timestamp:'2026-09-01T10:00:00Z'}],
  feedback:[{projectId:'project_lost',createdAt:'2026-09-02T10:00:00Z'}],
  assessments:[{projectId:'project_lost',studentId:'student_1',grade:8,updatedAt:'2026-09-03T10:00:00Z'}],
  formative:[{assignmentId:'assignment_lost',results:[{studentId:'student_1'}]}],summative:[],aiReviews:[]
};

test('finds a missing group through its preserved assignment and project evidence',()=>{
  const result=analyzeCoreRecovery(base),candidate=result.candidates[0];
  assert.equal(result.candidates.length,1);
  assert.equal(candidate.groupId,'group_lost');
  assert.equal(candidate.confidence,'high');
  assert.equal(candidate.recoveryReady,true);
  assert.deepEqual(candidate.studentIds,['student_1']);
  assert.deepEqual(candidate.teacherIds,['teacher_1']);
  assert.deepEqual(candidate.evidence,{assignments:1,projects:1,progressedProjects:1,commits:1,feedback:1,finalGrades:1,formativeGrades:1,summativeGrades:0,aiReviews:0});
  assert.equal(candidate.students[0].passwordHash,undefined);
});

test('does not report assignments whose group still exists',()=>{
  const result=analyzeCoreRecovery({...base,assignments:[base.assignments[0]],projects:[]});
  assert.deepEqual(result.candidates,[]);
});

test('blocks automatic recovery when Neon records an explicit group deletion',()=>{
  const result=analyzeCoreRecovery({...base,directoryAudit:[{entityId:'group_lost',action:'directory.group_deleted',createdAt:'2026-09-04T10:00:00Z'}]});
  assert.equal(result.candidates[0].explicitlyDeleted,true);
  assert.equal(result.candidates[0].recoveryReady,false);
});

test('reports projects whose assignment record is also missing',()=>{
  const result=analyzeCoreRecovery({...base,assignments:[],projects:base.projects});
  assert.equal(result.candidates.length,0);
  assert.equal(result.orphanedProjects[0].assignmentId,'assignment_lost');
});
