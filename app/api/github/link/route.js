import { z } from 'zod';
import { requireApiUser, fail, ok } from '@/lib/http';
import { getProject, patchProject } from '@/services/projects';
import { canAccessStudent } from '@/lib/auth';
import { listInstallationRepos } from '@/services/github';
const schema=z.object({projectId:z.string(),repoId:z.coerce.number()});
export async function POST(req){const auth=await requireApiUser();if(auth.error)return auth.error;try{const body=schema.parse(await req.json());const project=await getProject(body.projectId);if(!project||!canAccessStudent(auth.user,project.studentId))return fail('Forbidden',403);if(!project.githubInstallationId)return fail('GitHub App not installed',400);const repos=await listInstallationRepos(project.githubInstallationId);const repo=repos.find(r=>r.id===body.repoId);if(!repo)return fail('Repository not available to this installation',404);const updated=await patchProject(project.id,{githubOwner:repo.owner.login,githubRepo:repo.name,defaultBranch:repo.default_branch,lastSyncedAt:null});return ok({project:updated});}catch(e){return fail(e.message,400,e?.issues)}}
