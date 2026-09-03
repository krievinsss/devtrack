import { z } from 'zod';
import { requireApiUser, fail, ok } from '@/lib/http';
import { getProject, patchProject } from '@/services/projects';
import { listInstallationRepos } from '@/services/github';
import { updateJson } from '@/lib/storage';

const schema=z.object({projectId:z.string(),repoId:z.coerce.number()});

export async function POST(req){
  const auth=await requireApiUser();
  if(auth.error)return auth.error;
  if(auth.user.role!=='student')return fail('Only students can link repositories',403);

  try{
    const body=schema.parse(await req.json());
    const project=await getProject(body.projectId);
    if(!project||project.studentId!==auth.user.id)return fail('Forbidden',403);

    const installationId=auth.user.githubInstallationId||project.githubInstallationId;
    if(!installationId)return fail('GitHub App not installed',400);

    const repos=await listInstallationRepos(installationId);
    const repo=repos.find(r=>r.id===body.repoId);
    if(!repo)return fail('Repository not available to this GitHub account',404);
    const repositoryChanged=project.githubOwner!==repo.owner.login||project.githubRepo!==repo.name;

    const updated=await patchProject(project.id,{
      githubInstallationId:installationId,
      githubOwner:repo.owner.login,
      githubRepo:repo.name,
      defaultBranch:repo.default_branch||'main',
      lastSyncedAt:null
    });
    if(repositoryChanged)await updateJson('commits',[],items=>items.filter(commit=>commit.repositoryId!==project.id));
    return ok({project:updated,repositoryChanged});
  }catch(e){
    return fail(e.message,400,e?.issues);
  }
}
