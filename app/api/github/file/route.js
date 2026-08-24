import { requireApiUser, fail, ok } from '@/lib/http';
import { repoFile } from '@/services/github';
import { getProject } from '@/services/projects';
import { canAccessStudent } from '@/lib/auth';
export async function GET(req){const auth=await requireApiUser();if(auth.error)return auth.error;try{const u=new URL(req.url);const projectId=u.searchParams.get('projectId');const path=u.searchParams.get('path');if(!projectId||!path)return fail('projectId and path required');const project=await getProject(projectId);if(!project||!canAccessStudent(auth.user,project.studentId))return fail('Forbidden',403);return ok({file:await repoFile(projectId,path)});}catch(e){return fail(e.message,502)}}
