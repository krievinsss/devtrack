'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Github,Link2,Loader2,RefreshCw,Settings } from 'lucide-react';

export default function GitHubConnect({project}){
  const router=useRouter();
  const [repos,setRepos]=useState([]),[busy,setBusy]=useState(false),[selected,setSelected]=useState('');
  async function load(){if(!project.githubInstallationId)return;setBusy(true);try{const r=await fetch(`/api/github/repos?installationId=${project.githubInstallationId}`,{cache:'no-store'});const d=await r.json();setRepos(d.repos||[])}finally{setBusy(false)}}
  useEffect(()=>{if(project.githubInstallationId&&!project.githubRepo)load()},[project.githubInstallationId,project.githubRepo]);
  if(project.githubRepo)return <div className="inline-row"><a className="btn secondary" href={`https://github.com/${project.githubOwner}/${project.githubRepo}`} target="_blank" rel="noreferrer"><Github size={16}/>{project.githubOwner}/{project.githubRepo}</a>{project.githubInstallationId&&<a className="btn secondary" href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={16}/> Manage access</a>}</div>;
  if(!project.githubInstallationId)return <a className="btn secondary" href={`/api/github/install?projectId=${project.id}`}><Github size={16}/> Connect GitHub</a>;
  async function link(){if(!selected||busy)return;setBusy(true);try{const r=await fetch('/api/github/link',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify({projectId:project.id,repoId:Number(selected)})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not link repository');router.refresh();await new Promise(resolve=>setTimeout(resolve,80));router.refresh();}catch(e){alert(e.message)}finally{setBusy(false)}}
  return <div className="repo-connect"><select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">Select repository…</option>{repos.map(r=><option key={r.id} value={r.id}>{r.fullName}{r.private?' · private':''}</option>)}</select><button className="btn secondary" onClick={link} disabled={!selected||busy}>{busy?<Loader2 size={16}/>:<Link2 size={16}/>} Link</button><button className="btn secondary" onClick={load} disabled={busy}><RefreshCw size={16}/> Refresh</button><a className="btn secondary" href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={16}/> Manage GitHub access</a></div>;
}
