import crypto from 'node:crypto';
import { readJson, updateJson } from '@/lib/storage';
import { getUsers } from './users';

export async function getAssignments(){ return readJson('assignments',[]); }
export async function getAssignment(id){ return (await getAssignments()).find(a=>a.id===id)||null; }
export async function assignmentsForGroup(groupId){ return (await getAssignments()).filter(a=>a.groupId===groupId); }
export function assignmentIsActive(assignment){ return assignment?.active!==false && assignment?.status!=='inactive'; }

async function ensureStudentProjects(assignment){
  const groups=await readJson('groups',[]); const group=groups.find(g=>g.id===assignment.groupId); if(!group)throw new Error('Group not found');
  const users=await getUsers();
  await updateJson('projects',[],projects=>{
    const existing=new Set(projects.filter(p=>p.assignmentId===assignment.id).map(p=>p.studentId));
    const fresh=(group.studentIds||[]).filter(id=>!existing.has(id)).map(studentId=>{const s=users.find(u=>u.id===studentId);return {id:`project_${crypto.randomUUID()}`,assignmentId:assignment.id,studentId,name:assignment.title,slug:assignment.slug,type:'assigned_project',status:'Not started',technologies:assignment.technologies||[],githubOwner:'',githubRepo:'',defaultBranch:'main',githubInstallationId:s?.githubInstallationId||null,startDate:assignment.startDate,deadline:assignment.deadline,teacherScore:null,lastSyncedAt:null};});
    const synced=projects.map(p=>p.assignmentId===assignment.id?{...p,name:assignment.title,slug:assignment.slug,technologies:assignment.technologies||[],startDate:assignment.startDate,deadline:assignment.deadline}:p);
    return [...fresh,...synced];
  });
}

export async function createAssignment(input,user){
  const groups=await readJson('groups',[]); const group=groups.find(g=>g.id===input.groupId); if(!group)throw new Error('Group not found');
  const assignment={id:`assignment_${crypto.randomUUID()}`,title:input.title.trim(),slug:input.slug||input.title.toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/(^-|-$)/g,''),groupId:input.groupId,teacherId:user.id,description:input.description.trim(),descriptionHtml:input.descriptionHtml||'',requirements:input.requirements||[],technologies:input.technologies||[],rubric:input.rubric||[],startDate:input.startDate,deadline:input.deadline,active:input.active===true,status:input.active===true?'published':'inactive',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await updateJson('assignments',[],x=>[assignment,...x]);
  await ensureStudentProjects(assignment);
  return assignment;
}

export async function updateAssignment(id,input,user){
  let saved=null;
  await updateJson('assignments',[],items=>items.map(a=>{
    if(a.id!==id)return a;
    const active=input.active===undefined?assignmentIsActive(a):!!input.active;
    saved={...a,...input,id:a.id,teacherId:a.teacherId||user.id,title:(input.title??a.title).trim(),description:(input.description??a.description??'').trim(),active,status:active?'published':'inactive',updatedAt:new Date().toISOString()};
    return saved;
  }));
  if(!saved)throw new Error('Project not found');
  await ensureStudentProjects(saved);
  return saved;
}

export async function setAssignmentActive(id,active,user){
  let saved=null;
  await updateJson('assignments',[],items=>items.map(a=>{
    if(a.id!==id)return a;
    saved={...a,teacherId:a.teacherId||user.id,active:!!active,status:active?'published':'inactive',updatedAt:new Date().toISOString()};
    return saved;
  }));
  if(!saved)throw new Error('Project not found');
  if(active)await ensureStudentProjects(saved);
  return saved;
}

export async function deleteAssignment(id){
  const assignment=await getAssignment(id); if(!assignment)throw new Error('Project not found');
  await updateJson('assignments',[],items=>items.filter(a=>a.id!==id));
  await updateJson('projects',[],items=>items.filter(p=>p.assignmentId!==id));
  return assignment;
}
