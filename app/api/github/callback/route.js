import { currentUser } from '@/lib/auth';
import { patchProject, getProject } from '@/services/projects';
import { patchUser } from '@/services/users';
import { listInstallationRepos } from '@/services/github';
import { readGitHubState } from '@/lib/githubState';

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
    if (user.role !== 'student') return redirect(req, '/projects?github=student_only');

    const url = new URL(req.url);
    const installationId = url.searchParams.get('installation_id');
    const state = url.searchParams.get('state');

    let projectId = null;
    try {
      const decoded=readGitHubState(state);
      if(decoded.userId===user.id)projectId=decoded.projectId;
    } catch {
      return redirect(req, '/projects?github=invalid_state');
    }

    const project = projectId ? await getProject(projectId) : null;
    if (!installationId || !project || project.studentId !== user.id) return redirect(req, '/projects?github=error');

    const id = Number(installationId);
    if (!Number.isFinite(id)) return redirect(req, '/projects?github=invalid_installation');

    await patchUser(user.id, {
      githubInstallationId: id,
      githubConnectedAt: new Date().toISOString(),
    });
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
        // Do not block the GitHub callback with a potentially long commit sync.
        // The project UI displays a loader and starts the sync after this redirect.
        return redirect(req, `/projects/${projectId}?github=syncing`);
      }

      console.log('GitHub installation connected; repository selection required', {
        studentId: user.id,
        projectId,
        installationId: id,
        repositoryCount: repos.length,
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
