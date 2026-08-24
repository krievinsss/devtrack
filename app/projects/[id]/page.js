import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import ProjectWorkspace from '@/components/ProjectWorkspace';
import { requirePageUser } from '@/lib/page';
import { canAccessStudent } from '@/lib/auth';
import { getProject } from '@/services/projects';
import { getUser } from '@/services/users';
import { readJson } from '@/lib/storage';
import { getFeedback } from '@/services/feedback';
import { getAssessment } from '@/services/assessments';
import { repoFile,repoTree } from '@/services/github';
import { weeklySeries,contributionDays } from '@/services/analytics';
import { getAssignment } from '@/services/assignments';
import { getFormativeEvents } from '@/services/formative';

export default async function Project({params}){
  const user=await requirePageUser();
  const {id}=await params;
  const project=await getProject(id);
  if(!project||!canAccessStudent(user,project.studentId))notFound();

  const student=await getUser(project.studentId);
  const commits=(await readJson('commits',[])).filter(c=>c.repositoryId===id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const feedback=await getFeedback(id);
  const assessment=await getAssessment(id);
  const assignment=project.assignmentId?await getAssignment(project.assignmentId):null;
  const formative=assignment?await getFormativeEvents(assignment.id):[];
  const review=user.role==='student'?null:(await readJson('aiReviews',[])).filter(r=>r.projectId===id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0]||null;

  let tree=[];
  let defaultFile=null;
  let githubError=null;

  if(project.githubInstallationId && project.githubOwner && project.githubRepo){
    try{
      tree=await repoTree(id,'');
      const fileEntry=tree.find(x=>x.type==='blob');
      if(fileEntry){
        try{defaultFile={path:fileEntry.path,...await repoFile(id,fileEntry.path)}}
        catch(error){githubError=`Could not load file: ${error.message}`;console.error('GitHub file load failed',{projectId:id,error});}
      }
    }catch(error){
      githubError=error instanceof Error?error.message:'Unknown GitHub repository error';
      console.error('GitHub repository tree failed',{projectId:id,installationId:project.githubInstallationId,owner:project.githubOwner,repo:project.githubRepo,branch:project.defaultBranch,error});
    }
  } else if(project.githubInstallationId){
    githubError='GitHub is connected, but no repository is linked to this project yet.';
  } else {
    githubError='GitHub is not connected to this project yet.';
  }

  return <AppShell user={user}><ProjectWorkspace project={project} assignment={assignment} formative={formative} student={student} commits={commits} feedback={feedback} assessment={assessment} review={review} tree={tree} defaultFile={defaultFile} githubError={githubError} series={weeklySeries(commits)} heatmap={contributionDays(commits)} user={user}/></AppShell>
}
