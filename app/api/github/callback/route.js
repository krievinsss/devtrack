import { currentUser, canAccessStudent } from '@/lib/auth';
import { patchProject, getProject } from '@/services/projects';
import { patchUser } from '@/services/users';
import { updateJson } from '@/lib/storage';

function redirect(req, path) {
  return Response.redirect(new URL(path, req.url));
}

export async function GET(req) {
  try {
    const user = await currentUser();
    if (!user) return redirect(req, '/login');

    const url = new URL(req.url);
    const installationId = url.searchParams.get('installation_id');
    const state = url.searchParams.get('state');

    let projectId = null;
    try {
      const decoded = JSON.parse(Buffer.from(state || '', 'base64url').toString());
      if (decoded.userId === user.id && Date.now() - decoded.ts < 15 * 60 * 1000) {
        projectId = decoded.projectId;
      }
    } catch {
      return redirect(req, '/projects?github=invalid_state');
    }

    const project = projectId ? await getProject(projectId) : null;
    if (!installationId || !project || !canAccessStudent(user, project.studentId)) {
      return redirect(req, '/projects?github=error');
    }

    const id = Number(installationId);
    if (!Number.isFinite(id)) return redirect(req, '/projects?github=invalid_installation');

    if (user.role === 'student') {
      await patchUser(user.id, {
        githubInstallationId: id,
        githubConnectedAt: new Date().toISOString(),
      });

      await updateJson('projects', [], (items) =>
        items.map((p) =>
          p.studentId === user.id && !p.githubInstallationId
            ? { ...p, githubInstallationId: id }
            : p
        )
      );
    }

    await patchProject(projectId, { githubInstallationId: id });
    return redirect(req, `/projects/${projectId}?github=connected`);
  } catch (error) {
    console.error('GitHub callback failed:', error);
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Unknown callback error');
    return redirect(req, `/projects?github=callback_failed&reason=${message}`);
  }
}
