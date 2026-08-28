import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ProjectWorkspace from '@/components/ProjectWorkspace';
import TeacherReviewWorkspace from '@/components/TeacherReviewWorkspace';
import { requirePageUser } from '@/lib/page';
import { canAccessStudent } from '@/lib/auth';
import { getProject,patchProject } from '@/services/projects';
import { getUser } from '@/services/users';
import { readJson } from '@/lib/storage';
import { getFeedback } from '@/services/feedback';
import { getAssessment } from '@/services/assessments';
import { repoFile,repoTree } from '@/services/github';
import { weeklySeries,contributionDays } from '@/services/analytics';
import { getAssignment,assignmentIsActive } from '@/services/assignments';
import { getFormativeEvents } from '@/services/formative';

export default async function Project({params}){
  const user=await requirePageUser();
  const {id}=await params;
  let project=await getProject(id);
  if(!project||!canAccessStudent(user,project.studentId))notFound();
  const assignment=project.assignmentId?await getAssignment(project.assignmentId):null;
  if(user.role==='student'&&assignment&&!assignmentIsActive(assignment))notFound();
  const student=await getUser(project.studentId);
  if(!project.githubInstallationId&&student?.githubInstallationId){project={...project,githubInstallationId:student.githubInstallationId};try{const saved=await patchProject(id,{githubInstallationId:student.githubInstallationId});if(saved)project=saved;}catch(error){console.error('GitHub installation inheritance failed',{projectId:id,studentId:student.id,error});}}
  const commits=(await readJson('commits',[])).filter(c=>c.repositoryId===id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const feedback=await getFeedback(id);const assessment=await getAssessment(id);const formative=assignment?await getFormativeEvents(assignment.id):[];const review=user.role==='student'?null:(await readJson('aiReviews',[])).filter(r=>r.projectId===id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||null;

  if(user.role!=='student')return <AppShell user={user}><TeacherReviewWorkspace project={project} assignment={assignment} formative={formative} student={student} commits={commits} feedback={feedback} assessment={assessment} review={review}/></AppShell>;

  const attendance=(await readJson('attendance',[])).filter(a=>a.studentId===project.studentId).filter(a=>{const d=new Date(a.date||a.createdAt);const start=assignment?.startDate||project.startDate;const end=assignment?.deadline||project.deadline;return (!start||d>=new Date(start))&&(!end||d<=new Date(`${end}T23:59:59`));});
  let tree=[];let defaultFile=null;let githubError=null;
  if(project.githubInstallationId&&project.githubOwner&&project.githubRepo){try{tree=await repoTree(id,'');const fileEntry=tree.find(x=>x.type==='blob');if(fileEntry){try{defaultFile={path:fileEntry.path,...await repoFile(id,fileEntry.path)}}catch(error){githubError=`Could not load file: ${error.message}`;console.error('GitHub file load failed',{projectId:id,error});}}}catch(error){githubError=error instanceof Error?error.message:'Unknown GitHub repository error';console.error('GitHub repository tree failed',{projectId:id,installationId:project.githubInstallationId,owner:project.githubOwner,repo:project.githubRepo,branch:project.defaultBranch,error});}}else if(project.githubInstallationId){githubError='GitHub is connected. Select the repository for this project.';}else{githubError='GitHub is not connected to this project yet.';}
  return <AppShell user={user}><ProjectWorkspace project={project} assignment={assignment} formative={formative} student={student} commits={commits} feedback={feedback} assessment={assessment} review={review} tree={tree} defaultFile={defaultFile} githubError={githubError} series={weeklySeries(commits)} heatmap={contributionDays(commits)} attendance={attendance} user={user}/></AppShell>
}
