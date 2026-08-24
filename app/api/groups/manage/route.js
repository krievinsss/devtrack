import crypto from 'node:crypto';
import { z } from 'zod';
import { requireApiUser, fail, ok } from '@/lib/http';
import { readJson, writeJson } from '@/lib/storage';
import { hashPassword, defaultStudentPassword } from '@/lib/password';

const groupName=z.string().trim().min(1).max(80);
const studentSchema=z.object({firstName:z.string().trim().min(1),lastName:z.string().trim().min(1),email:z.string().trim().email()});
const id=(prefix)=>`${prefix}_${crypto.randomBytes(6).toString('hex')}`;

async function teacher(){const auth=await requireApiUser();if(auth.error)return auth;if(!['teacher','admin'].includes(auth.user.role))return {error:fail('Forbidden',403)};return auth;}

function projectForAssignment(assignment, student){
  return {
    id:`project_${crypto.randomUUID()}`,
    assignmentId:assignment.id,
    studentId:student.id,
    name:assignment.title,
    slug:assignment.slug,
    type:'assigned_project',
    status:'Not started',
    progress:0,
    technologies:assignment.technologies||[],
    githubOwner:'',
    githubRepo:'',
    defaultBranch:'main',
    githubInstallationId:student.githubInstallationId||null,
    startDate:assignment.startDate,
    deadline:assignment.deadline,
    teacherScore:null,
    lastSyncedAt:null,
  };
}

async function addExistingAssignmentsToStudents(groupId, students){
  if(!students.length)return 0;
  const [assignments,projects]=await Promise.all([readJson('assignments',[]),readJson('projects',[])]);
  const groupAssignments=assignments.filter(a=>a.groupId===groupId&&a.status!=='archived');
  if(!groupAssignments.length)return 0;
  const existing=new Set(projects.map(p=>`${p.assignmentId}:${p.studentId}`));
  const fresh=[];
  for(const student of students){
    for(const assignment of groupAssignments){
      const key=`${assignment.id}:${student.id}`;
      if(existing.has(key))continue;
      fresh.push(projectForAssignment(assignment,student));
      existing.add(key);
    }
  }
  if(fresh.length)await writeJson('projects',[...fresh,...projects]);
  return fresh.length;
}

export async function POST(req){
  const auth=await teacher();if(auth.error)return auth.error;
  try{
    const body=await req.json();
    const [groups,users]=await Promise.all([readJson('groups',[]),readJson('users',[])]);
    const password=defaultStudentPassword();

    if(body.action==='createGroup'){
      const name=groupName.parse(body.name);
      if(groups.some(g=>g.name.toLowerCase()===name.toLowerCase()))return fail('Grupa ar šādu nosaukumu jau eksistē',409);
      const group={id:id('group'),name,studentIds:[],createdAt:new Date().toISOString()};
      await writeJson('groups',[...groups,group]);return ok({group});
    }

    if(body.action==='renameGroup'){
      const name=groupName.parse(body.name);const groupId=z.string().parse(body.groupId);
      await writeJson('groups',groups.map(g=>g.id===groupId?{...g,name}:g));return ok({});
    }

    if(body.action==='deleteGroup'){
      const groupId=z.string().parse(body.groupId);
      await Promise.all([
        writeJson('groups',groups.filter(g=>g.id!==groupId)),
        writeJson('users',users.map(u=>({...u,groupIds:(u.groupIds||[]).filter(x=>x!==groupId)})))
      ]);return ok({});
    }

    if(body.action==='addStudent'){
      const groupId=z.string().parse(body.groupId);const s=studentSchema.parse(body.student);
      if(users.some(u=>u.email.toLowerCase()===s.email.toLowerCase()))return fail('Šāds e-pasts jau eksistē',409);
      const student={id:id('student'),role:'student',...s,groupIds:[groupId],githubUsername:null,githubInstallationId:null,passwordHash:hashPassword(password),mustChangePassword:true,createdAt:new Date().toISOString()};
      await Promise.all([
        writeJson('users',[...users,student]),
        writeJson('groups',groups.map(g=>g.id===groupId?{...g,studentIds:[...(g.studentIds||[]),student.id]}:g))
      ]);
      const projectsCreated=await addExistingAssignmentsToStudents(groupId,[student]);
      return ok({student,defaultPassword:password,projectsCreated});
    }

    if(body.action==='importStudents'){
      const groupId=z.string().parse(body.groupId);const incoming=z.array(studentSchema).min(1).max(500).parse(body.students);
      const existingEmails=new Set(users.map(u=>u.email.toLowerCase()));const batchEmails=new Set();const created=[];const skipped=[];
      for(const raw of incoming){const email=raw.email.toLowerCase();if(existingEmails.has(email)||batchEmails.has(email)){skipped.push(email);continue;}batchEmails.add(email);created.push({id:id('student'),role:'student',...raw,email,groupIds:[groupId],githubUsername:null,githubInstallationId:null,passwordHash:hashPassword(password),mustChangePassword:true,createdAt:new Date().toISOString()});}
      const ids=created.map(s=>s.id);
      await Promise.all([
        writeJson('users',[...users,...created]),
        writeJson('groups',groups.map(g=>g.id===groupId?{...g,studentIds:[...(g.studentIds||[]),...ids]}:g))
      ]);
      const projectsCreated=await addExistingAssignmentsToStudents(groupId,created);
      return ok({created:created.length,skipped,defaultPassword:password,projectsCreated});
    }

    if(body.action==='updateStudent'){
      const studentId=z.string().parse(body.studentId);const s=studentSchema.parse(body.student);
      if(users.some(u=>u.id!==studentId&&u.email.toLowerCase()===s.email.toLowerCase()))return fail('Šāds e-pasts jau eksistē',409);
      await writeJson('users',users.map(u=>u.id===studentId?{...u,...s}:u));return ok({});
    }

    if(body.action==='removeFromGroup'){
      const groupId=z.string().parse(body.groupId),studentId=z.string().parse(body.studentId);
      await Promise.all([
        writeJson('groups',groups.map(g=>g.id===groupId?{...g,studentIds:(g.studentIds||[]).filter(x=>x!==studentId)}:g)),
        writeJson('users',users.map(u=>u.id===studentId?{...u,groupIds:(u.groupIds||[]).filter(x=>x!==groupId)}:u))
      ]);return ok({});
    }

    if(body.action==='deleteStudent'){
      const studentId=z.string().parse(body.studentId);
      const projects=await readJson('projects',[]);const projectIds=new Set(projects.filter(p=>p.studentId===studentId).map(p=>p.id));
      const [commits,feedback,assessments,reviews,attendance]=await Promise.all([readJson('commits',[]),readJson('feedback',[]),readJson('assessments',[]),readJson('aiReviews',[]),readJson('attendance',[])]);
      await Promise.all([
        writeJson('users',users.filter(u=>u.id!==studentId)),
        writeJson('groups',groups.map(g=>({...g,studentIds:(g.studentIds||[]).filter(x=>x!==studentId)}))),
        writeJson('projects',projects.filter(p=>p.studentId!==studentId)),
        writeJson('commits',commits.filter(c=>!projectIds.has(c.repositoryId))),
        writeJson('feedback',feedback.filter(f=>f.studentId!==studentId&&!projectIds.has(f.projectId))),
        writeJson('assessments',assessments.filter(a=>a.studentId!==studentId&&!projectIds.has(a.projectId))),
        writeJson('aiReviews',reviews.filter(r=>!projectIds.has(r.projectId))),
        writeJson('attendance',attendance.filter(a=>a.studentId!==studentId))
      ]);return ok({});
    }

    if(body.action==='resetPassword'){
      const studentId=z.string().parse(body.studentId);
      await writeJson('users',users.map(u=>u.id===studentId?{...u,passwordHash:hashPassword(password),mustChangePassword:true,passwordResetAt:new Date().toISOString()}:u));return ok({defaultPassword:password});
    }

    return fail('Unknown action',400);
  }catch(e){return fail(e.message||'Invalid request',400,e?.issues);}
}
