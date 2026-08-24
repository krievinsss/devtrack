import { currentUser, canAccessStudent } from '@/lib/auth';
import { patchProject, getProject } from '@/services/projects';
import { patchUser } from '@/services/users';
import { updateJson } from '@/lib/storage';
import { listInstallationRepos, syncProject } from '@/services/github';

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

    // If the student granted access to exactly one repository during installation,
    // link it automatically to the project and sync commits immediately.
    try {
      const repos = await listInstallationRepos(id);
      if (repos.length === 1) {
        const repo = repos[0];
        await patchProject(projectId, {
          githubOwner: repo.owner.login,
          githubRepo: repo.name,
          defaultBranch: repo.default_branch || 'main',
          lastSyncedAt: null,
        });
        try { await syncProject(projectId); } catch (syncError) {
          console.error('Initial GitHub sync failed:', syncError);
        }
        return redirect(req, `/projects/${projectId}?github=linked`);
      }
    } catch (repoError) {
      console.error('Could not auto-link GitHub repository:', repoError);
    }

    // Multiple repositories: return to the project and let the student choose one.
    return redirect(req, `/projects/${projectId}?github=choose_repo`);
  } catch (error) {
    console.error('GitHub callback failed:', error);
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Unknown callback error');
    return redirect(req, `/projects?github=callback_failed&reason=${message}`);
  }
}
