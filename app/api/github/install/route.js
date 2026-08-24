import { requireApiUser,fail } from '@/lib/http';
import { getProject } from '@/services/projects';

export async function GET(req){
  const auth=await requireApiUser();
  if(auth.error)return auth.error;
  if(auth.user.role!=='student')return fail('Only students can connect GitHub to their projects',403);

  const slug=process.env.GITHUB_APP_SLUG;
  if(!slug)return fail('GITHUB_APP_SLUG nav konfigurēts',503);

  const u=new URL(req.url);
  const projectId=u.searchParams.get('projectId');
  const project=projectId?await getProject(projectId):null;
  if(!project||project.studentId!==auth.user.id)return fail('Project not found or not owned by student',403);

  const state=Buffer.from(JSON.stringify({projectId,userId:auth.user.id,ts:Date.now()})).toString('base64url');
  return Response.redirect(`https://github.com/apps/${slug}/installations/new?state=${state}`);
}
