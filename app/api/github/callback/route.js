import { currentUser, canAccessStudent } from '@/lib/auth';
import { patchProject, getProject } from '@/services/projects';
import { patchUser } from '@/services/users';
import { updateJson } from '@/lib/storage';
import { listInstallationRepos, syncProject } from '@/services/github';

function redirect(req, path) {
  return Response.redirect(new URL(path, req.url));
}

function normalize(value='') {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
      if (decoded.userId === user.id && Date.now() - decoded.ts < 15 * 60 * 1000) projectId = decoded.projectId;
    } catch {
      return redirect(req, '/projects?github=invalid_state');
    }

    const project = projectId ? await getProject(projectId) : null;
    if (!installationId || !project || !canAccessStudent(user, project.studentId)) return redirect(req, '/projects?github=error');

    const id = Number(installationId);
    if (!Number.isFinite(id)) return redirect(req, '/projects?github=invalid_installation');

    if (user.role === 'student') {
      await patchUser(user.id, { githubInstallationId: id, githubConnectedAt: new Date().toISOString() });
      await updateJson('projects', [], items => items.map(p => p.studentId === user.id && !p.githubInstallationId ? { ...p, githubInstallationId: id } : p));
    }

    await patchProject(projectId, { githubInstallationId: id });

    try {
      const repos = await listInstallationRepos(id);
      const targetNames = new Set([normalize(project.slug), normalize(project.name)]);
      const matching = repos.filter(repo => targetNames.has(normalize(repo.name)));
      const repo = repos.length === 1 ? repos[0] : matching.length === 1 ? matching[0] : null;

      if (repo) {
        await patchProject(projectId, {
          githubOwner: repo.owner.login,
          githubRepo: repo.name,
          defaultBranch: repo.default_branch || 'main',
          lastSyncedAt: null,
        });
        try { await syncProject(projectId); } catch (syncError) { console.error('Initial GitHub sync failed:', syncError); }
        return redirect(req, `/projects/${projectId}?github=linked`);
      }

      console.log('GitHub installation connected; repository selection required', {
        projectId,
        installationId: id,
        repositoryCount: repos.length,
        repositories: repos.map(r => r.full_name),
      });
    } catch (repoError) {
      console.error('Could not inspect GitHub installation repositories:', repoError);
    }

    return redirect(req, `/projects/${projectId}?github=choose_repo`);
  } catch (error) {
    console.error('GitHub callback failed:', error);
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Unknown callback error');
    return redirect(req, `/projects?github=callback_failed&reason=${message}`);
  }
}
