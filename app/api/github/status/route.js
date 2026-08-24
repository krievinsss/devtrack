import { requireApiUser, fail, ok } from '@/lib/http';
import { getProject } from '@/services/projects';
import { canAccessStudent } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const projectId = url.searchParams.get('projectId');
  if (!projectId) return fail('projectId is required', 400);

  const project = await getProject(projectId);
  if (!project || !canAccessStudent(auth.user, project.studentId)) return fail('Project not found', 404);

  return ok({
    connected: Boolean(project.githubInstallationId),
    linked: Boolean(project.githubInstallationId && project.githubOwner && project.githubRepo),
    synced: Boolean(project.lastSyncedAt),
    owner: project.githubOwner || null,
    repo: project.githubRepo || null,
    branch: project.defaultBranch || 'main',
    lastSyncedAt: project.lastSyncedAt || null,
  });
}
