import 'server-only';
import { SignJWT } from 'jose';
import crypto from 'node:crypto';
import { getProject, patchProject } from './projects';
import { readJson, writeJson } from '@/lib/storage';

const API='https://api.github.com';
const headers=(token)=>({Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'DevTrack'});

async function appJwt(){
  const id=process.env.GITHUB_APP_ID; const raw=process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g,'\n');
  if(!id||!raw) throw new Error('GitHub App is not configured');
  const key=crypto.createPrivateKey(raw); const now=Math.floor(Date.now()/1000);
  return new SignJWT({iat:now-60,exp:now+540,iss:id}).setProtectedHeader({alg:'RS256'}).sign(key);
}
export async function installationToken(installationId){
  const jwt=await appJwt(); const r=await fetch(`${API}/app/installations/${installationId}/access_tokens`,{method:'POST',headers:headers(jwt),cache:'no-store'});
  if(!r.ok) throw new Error(`GitHub token error ${r.status}`); return (await r.json()).token;
}
export async function listInstallationRepos(installationId){ const token=await installationToken(installationId); const r=await fetch(`${API}/installation/repositories?per_page=100`,{headers:headers(token),cache:'no-store'}); if(!r.ok)throw new Error('Cannot list repositories'); return (await r.json()).repositories; }
export async function repoTree(projectId,path=''){
  const p=await getProject(projectId); if(!p)throw new Error('Project not found');
  if(!p.githubInstallationId||!p.githubOwner||!p.githubRepo){ const demo=await readJson('repository-demo',{}); return demo[p.id]?.tree||[]; }
  const token=await installationToken(p.githubInstallationId); const url=`${API}/repos/${p.githubOwner}/${p.githubRepo}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${encodeURIComponent(p.defaultBranch||'main')}`;
  const r=await fetch(url,{headers:headers(token),next:{revalidate:30}}); if(!r.ok)throw new Error(`GitHub contents error ${r.status}`); const data=await r.json(); return (Array.isArray(data)?data:[data]).map(x=>({path:x.path,type:x.type==='dir'?'tree':'blob',sha:x.sha,size:x.size}));
}
export async function repoFile(projectId,path){
  const p=await getProject(projectId); if(!p)throw new Error('Project not found');
  if(!p.githubInstallationId||!p.githubOwner||!p.githubRepo){ const demo=await readJson('repository-demo',{}); return {content:demo[p.id]?.files?.[path]||'// Demo file content not available',sha:'demo',path}; }
  const token=await installationToken(p.githubInstallationId); const r=await fetch(`${API}/repos/${p.githubOwner}/${p.githubRepo}/contents/${encodeURIComponent(path).replace(/%2F/g,'/')}?ref=${encodeURIComponent(p.defaultBranch||'main')}`,{headers:headers(token),cache:'no-store'}); if(!r.ok)throw new Error(`GitHub file error ${r.status}`); const d=await r.json(); return {content:Buffer.from(d.content||'','base64').toString('utf8'),sha:d.sha,path:d.path};
}
export async function syncProject(projectId){
  const p=await getProject(projectId); if(!p?.githubInstallationId) return {demo:true}; const token=await installationToken(p.githubInstallationId);
  const r=await fetch(`${API}/repos/${p.githubOwner}/${p.githubRepo}/commits?sha=${encodeURIComponent(p.defaultBranch||'main')}&per_page=50`,{headers:headers(token),cache:'no-store'}); if(!r.ok)throw new Error(`GitHub commits error ${r.status}`); const list=await r.json();
  const existing=await readJson('commits',[]); const other=existing.filter(c=>c.repositoryId!==projectId); const mapped=[];
  for(const c of list.slice(0,50)){ let additions=0,deletions=0,filesChanged=0; try{ const d=await fetch(`${API}/repos/${p.githubOwner}/${p.githubRepo}/commits/${c.sha}`,{headers:headers(token),cache:'no-store'}).then(x=>x.json()); additions=d.stats?.additions||0;deletions=d.stats?.deletions||0;filesChanged=d.files?.length||0;}catch{}
    mapped.push({sha:c.sha,repositoryId:projectId,author:c.commit?.author?.name||c.author?.login||'Unknown',message:c.commit?.message||'',timestamp:c.commit?.author?.date||new Date().toISOString(),additions,deletions,filesChanged,branch:p.defaultBranch||'main'});
  }
  await writeJson('commits',[...mapped,...other]); await patchProject(projectId,{lastSyncedAt:new Date().toISOString()}); return {count:mapped.length};
}
