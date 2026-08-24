import crypto from 'node:crypto';
import { readJson, updateJson } from '@/lib/storage';
import { getUsers } from './users';

export async function getAssignments(){ return readJson('assignments',[]); }
export async function getAssignment(id){ return (await getAssignments()).find(a=>a.id===id)||null; }
export async function assignmentsForGroup(groupId){ return (await getAssignments()).filter(a=>a.groupId===groupId); }

export async function createAssignment(input,user){
  const groups=await readJson('groups',[]); const group=groups.find(g=>g.id===input.groupId); if(!group)throw new Error('Group not found');
  const assignment={id:`assignment_${crypto.randomUUID()}`,title:input.title.trim(),slug:input.slug||input.title.toLowerCase().replace(/[^a-z0-9]+/gi,'-').replace(/(^-|-$)/g,''),groupId:input.groupId,teacherId:user.id,description:input.description.trim(),descriptionHtml:input.descriptionHtml||'',requirements:input.requirements||[],technologies:input.technologies||[],rubric:input.rubric||[],startDate:input.startDate,deadline:input.deadline,status:'published',createdAt:new Date().toISOString()};
  await updateJson('assignments',[],x=>[assignment,...x]);
  const users=await getUsers();
  await updateJson('projects',[],projects=>{
    const existing=new Set(projects.filter(p=>p.assignmentId===assignment.id).map(p=>p.studentId));
    const fresh=group.studentIds.filter(id=>!existing.has(id)).map(studentId=>{const s=users.find(u=>u.id===studentId);return {id:`project_${crypto.randomUUID()}`,assignmentId:assignment.id,studentId,name:assignment.title,slug:assignment.slug,type:'assigned_project',status:'Not started',progress:0,technologies:assignment.technologies,githubOwner:'',githubRepo:'',defaultBranch:'main',githubInstallationId:s?.githubInstallationId||null,startDate:assignment.startDate,deadline:assignment.deadline,teacherScore:null,lastSyncedAt:null};});
    return [...fresh,...projects];
  });
  return assignment;
}
