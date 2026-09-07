import crypto from 'node:crypto';
import { after } from 'next/server';
import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { readJson,updateJson } from '@/lib/storage';
import { defaultStudentPassword,hashPassword } from '@/lib/password';
import { createCoreGroup,createCoreStudents,deleteCoreGroup,deleteCoreStudent,mirrorCoreDirectoryToBlob,removeCoreStudentFromGroup,renameCoreGroup } from '@/services/coreDirectory';
import { getGroups } from '@/services/groups';
import { getUsers,patchUser } from '@/services/users';

const groupName=z.string().trim().min(1).max(80);
const studentSchema=z.object({firstName:z.string().trim().min(1),lastName:z.string().trim().min(1),email:z.string().trim().email()});
const id=prefix=>`${prefix}_${crypto.randomBytes(6).toString('hex')}`;
const now=()=>new Date().toISOString();

async function teacher(permission){return requireApiUser(['teacher','admin'],{permission})}
function projectFor(assignment,student){return{id:`project_${crypto.randomUUID()}`,assignmentId:assignment.id,studentId:student.id,name:assignment.title,slug:assignment.slug,type:'assigned_project',status:'Not started',technologies:assignment.technologies||[],githubOwner:'',githubRepo:'',defaultBranch:'main',githubInstallationId:student.githubInstallationId||null,startDate:assignment.startDate,deadline:assignment.deadline,teacherScore:null,lastSyncedAt:null}}
async function addExistingProjects(groupId,students){const assignments=(await readJson('assignments',[])).filter(item=>item.groupId===groupId&&item.status!=='archived');if(!assignments.length||!students.length)return;await updateJson('projects',[],projects=>{const existing=new Set(projects.map(project=>`${project.assignmentId}:${project.studentId}`)),fresh=[];for(const student of students)for(const assignment of assignments){const key=`${assignment.id}:${student.id}`;if(!existing.has(key)){existing.add(key);fresh.push(projectFor(assignment,student))}}return[...fresh,...projects]})}
async function snapshot(actor){const [allGroups,users]=await Promise.all([getGroups(),getUsers()]),groups=actor.role==='admin'?allGroups:allGroups.filter(group=>(group.teacherIds||[]).includes(actor.id)),visibleStudentIds=new Set(groups.flatMap(group=>group.studentIds||[]));return{groups,students:users.filter(user=>user.role==='student'&&visibleStudentIds.has(user.id)).map(safeUser)}}
function safeUser(user){if(!user)return null;const {passwordHash,...safe}=user;return safe}
function scheduleMirror(){after(()=>mirrorCoreDirectoryToBlob())}

export async function GET(){const auth=await teacher('groups.view_assigned');if(auth.error)return auth.error;try{return ok(await snapshot(auth.user))}catch(error){return fail(error.message||'Could not load groups',500)}}

export async function POST(req){
  const auth=await teacher('groups.manage');if(auth.error)return auth.error;
  try{
    const body=await req.json(),password=defaultStudentPassword();
    const [groups,users]=await Promise.all([getGroups(),getUsers()]);

    if(body.action==='createGroup'){
      const name=groupName.parse(body.name);
      if(groups.some(group=>group.name.toLowerCase()===name.toLowerCase()))return fail('Grupa ar šādu nosaukumu jau eksistē',409);
      const group=await createCoreGroup({id:id('group'),name,studentIds:[],teacherIds:[],createdAt:now(),updatedAt:now()},{actorUserId:auth.user.id});
      scheduleMirror();return ok({group});
    }
    if(body.action==='renameGroup'){
      const name=groupName.parse(body.name),groupId=z.string().parse(body.groupId);
      if(groups.some(group=>group.id!==groupId&&group.name.toLowerCase()===name.toLowerCase()))return fail('Grupa ar šādu nosaukumu jau eksistē',409);
      const group=await renameCoreGroup(groupId,name,{actorUserId:auth.user.id});if(!group)return fail('Group not found',404);
      scheduleMirror();return ok({group});
    }
    if(body.action==='deleteGroup'){
      const groupId=z.string().parse(body.groupId);if(!groups.some(group=>group.id===groupId))return fail('Group not found',404);
      const deleted=await deleteCoreGroup(groupId,{actorUserId:auth.user.id});if(!deleted)return fail('Group not found',404);
      scheduleMirror();return ok({deleted:true,groupId});
    }
    if(body.action==='addStudent'){
      const groupId=z.string().parse(body.groupId),input=studentSchema.parse(body.student),email=input.email.toLowerCase();
      if(!groups.some(group=>group.id===groupId))return fail('Group not found',404);
      if(users.some(user=>user.email.toLowerCase()===email))return fail('Šāds e-pasts jau eksistē',409);
      const row={id:id('student'),role:'student',...input,email,groupIds:[groupId],githubUsername:null,githubInstallationId:null,passwordHash:hashPassword(password),mustChangePassword:true,createdAt:now(),updatedAt:now()};
      const [student]=await createCoreStudents([row],groupId,{actorUserId:auth.user.id});
      const group=(await getGroups()).find(item=>item.id===groupId)||null;
      after(async()=>{await Promise.allSettled([addExistingProjects(groupId,[student]),mirrorCoreDirectoryToBlob()])});
      return ok({student:safeUser(student),group,defaultPassword:password});
    }
    if(body.action==='importStudents'){
      const groupId=z.string().parse(body.groupId),incoming=z.array(studentSchema).min(1).max(500).parse(body.students),existingEmails=new Set(users.map(user=>user.email.toLowerCase())),batchEmails=new Set(),created=[],skipped=[];
      if(!groups.some(group=>group.id===groupId))return fail('Group not found',404);
      for(const raw of incoming){const email=raw.email.toLowerCase();if(existingEmails.has(email)||batchEmails.has(email)){skipped.push(email);continue}batchEmails.add(email);created.push({id:id('student'),role:'student',...raw,email,groupIds:[groupId],githubUsername:null,githubInstallationId:null,passwordHash:hashPassword(password),mustChangePassword:true,createdAt:now(),updatedAt:now()})}
      const createdStudents=await createCoreStudents(created,groupId,{actorUserId:auth.user.id}),group=(await getGroups()).find(item=>item.id===groupId)||null;
      after(async()=>{await Promise.allSettled([addExistingProjects(groupId,createdStudents),mirrorCoreDirectoryToBlob()])});
      return ok({createdStudents:createdStudents.map(safeUser),created:createdStudents.length,skipped,group,defaultPassword:password});
    }
    if(body.action==='updateStudent'){
      const studentId=z.string().parse(body.studentId),input=studentSchema.parse(body.student),email=input.email.toLowerCase();
      if(!users.some(user=>user.id===studentId&&user.role==='student'))return fail('Student not found',404);
      if(users.some(user=>user.id!==studentId&&user.email.toLowerCase()===email))return fail('Šāds e-pasts jau eksistē',409);
      const student=await patchUser(studentId,{...input,email,updatedAt:now()},{actorUserId:auth.user.id});if(!student)return fail('Student not found',404);
      scheduleMirror();return ok({student:safeUser(student)});
    }
    if(body.action==='removeFromGroup'){
      const groupId=z.string().parse(body.groupId),studentId=z.string().parse(body.studentId);
      if(!groups.some(group=>group.id===groupId)||!users.some(user=>user.id===studentId&&user.role==='student'))return fail('Student or group not found',404);
      const removed=await removeCoreStudentFromGroup(studentId,groupId,{actorUserId:auth.user.id});if(!removed)return fail('Student is not in this group',404);
      const [freshGroups,freshUsers]=await Promise.all([getGroups(),getUsers()]),group=freshGroups.find(item=>item.id===groupId)||null,student=freshUsers.find(item=>item.id===studentId)||null;
      scheduleMirror();return ok({group,student:safeUser(student)});
    }
    if(body.action==='deleteStudent'){
      const studentId=z.string().parse(body.studentId),projects=await readJson('projects',[]),projectIds=new Set(projects.filter(project=>project.studentId===studentId).map(project=>project.id));
      if(!users.some(user=>user.id===studentId&&user.role==='student'))return fail('Student not found',404);
      const deleted=await deleteCoreStudent(studentId,{actorUserId:auth.user.id});if(!deleted)return fail('Student not found',404);
      after(async()=>{await Promise.allSettled([
        updateJson('projects',[],items=>items.filter(project=>project.studentId!==studentId)),
        updateJson('commits',[],items=>items.filter(commit=>!projectIds.has(commit.repositoryId)&&!projectIds.has(commit.projectId))),
        updateJson('feedback',[],items=>items.filter(item=>item.studentId!==studentId&&!projectIds.has(item.projectId))),
        updateJson('assessments',[],items=>items.filter(item=>item.studentId!==studentId&&!projectIds.has(item.projectId))),
        updateJson('aiReviews',[],items=>items.filter(item=>item.studentId!==studentId&&!projectIds.has(item.projectId))),
        updateJson('attendance',[],items=>items.filter(item=>item.studentId!==studentId)),mirrorCoreDirectoryToBlob()
      ])});
      return ok({deleted:true,studentId});
    }
    if(body.action==='resetPassword'){
      const studentId=z.string().parse(body.studentId);if(!users.some(user=>user.id===studentId&&user.role==='student'))return fail('Student not found',404);
      const student=await patchUser(studentId,{passwordHash:hashPassword(password),mustChangePassword:true,passwordResetAt:now(),updatedAt:now()},{actorUserId:auth.user.id});
      if(!student)return fail('Student not found',404);scheduleMirror();return ok({student:safeUser(student),defaultPassword:password});
    }
    return fail('Unknown action',400);
  }catch(error){
    console.error('Group management failed',{action:'directory_mutation',message:error?.message||'Unknown error'});
    if(error?.name==='CoreDirectoryUnavailableError')return fail(error.message,503);
    if(error?.code==='23505'||error?.cause?.code==='23505')return fail('Šāds e-pasts vai grupas nosaukums jau eksistē',409);
    return fail(error.message||'Invalid request',400,error?.issues);
  }
}
