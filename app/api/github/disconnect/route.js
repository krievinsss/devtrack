import { requireApiUser,fail,ok } from '@/lib/http';
import { updateJson } from '@/lib/storage';
import { patchUser } from '@/services/users';

export async function POST(){
  const auth=await requireApiUser(['student']);
  if(auth.error)return auth.error;

  try{
    const projectIds=[];
    await updateJson('projects',[],projects=>projects.map(project=>{
      if(project.studentId!==auth.user.id)return project;
      projectIds.push(project.id);
      return {...project,githubInstallationId:null,githubOwner:'',githubRepo:'',defaultBranch:'main',lastSyncedAt:null,updatedAt:new Date().toISOString()};
    }));

    const ids=new Set(projectIds);
    await Promise.all([
      patchUser(auth.user.id,{githubInstallationId:null,githubConnectedAt:null,githubUsername:null,updatedAt:new Date().toISOString()}),
      updateJson('commits',[],commits=>commits.filter(commit=>!ids.has(commit.repositoryId)&&!ids.has(commit.projectId)))
    ]);

    return ok({disconnected:true,projectsUpdated:projectIds.length});
  }catch(error){
    console.error('GitHub disconnect failed',{studentId:auth.user.id,error});
    return fail('Neizdevās atvienot GitHub kontu',500);
  }
}
