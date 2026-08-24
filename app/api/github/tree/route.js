import { requireApiUser, fail, ok } from '@/lib/http';
import { repoTree } from '@/services/github';
import { getProject } from '@/services/projects';
import { canAccessStudent } from '@/lib/auth';

export async function GET(req){
  const auth=await requireApiUser();
  if(auth.error)return auth.error;
  try{
    const u=new URL(req.url);
    const projectId=u.searchParams.get('projectId');
    const path=u.searchParams.get('path')||'';
    if(!projectId)return fail('projectId required');
    const project=await getProject(projectId);
    if(!project||!canAccessStudent(auth.user,project.studentId))return fail('Forbidden',403);
    return ok({tree:await repoTree(projectId,path),path});
  }catch(e){
    console.error('GitHub tree API failed',e);
    return fail(e.message||'Could not load repository folder',502);
  }
}
