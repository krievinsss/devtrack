'use client';
import { useEffect,useState } from 'react';
import { useRouter,useSearchParams } from 'next/navigation';
import { Github,Link2,Loader2,RefreshCw,Settings,CheckCircle2 } from 'lucide-react';

export default function GitHubConnect({project}){
  const router=useRouter();
  const search=useSearchParams();
  const [repos,setRepos]=useState([]);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState('');
  const [phase,setPhase]=useState('');
  const [message,setMessage]=useState('');

  async function load(){
    if(!project.githubInstallationId)return;
    setBusy(true);
    try{const r=await fetch(`/api/github/repos?installationId=${project.githubInstallationId}`,{cache:'no-store'});const d=await r.json();setRepos(d.repos||[])}
    finally{setBusy(false)}
  }

  async function syncAndFinish(){
    setPhase('syncing');
    setMessage('GitHub konts ir pieslēgts. Ielādējam repozitoriju un commit vēsturi…');
    try{
      const r=await fetch('/api/github/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'GitHub sync failed');
      setPhase('done');
      setMessage('GitHub repozitorijs veiksmīgi pieslēgts.');
      router.replace(`/projects/${project.id}`);
      router.refresh();
      setTimeout(()=>setPhase(''),700);
    }catch(e){
      setPhase('error');
      setMessage(e.message||'Neizdevās pabeigt GitHub sinhronizāciju.');
    }
  }

  useEffect(()=>{
    if(project.githubInstallationId&&!project.githubRepo)load();
  },[project.githubInstallationId,project.githubRepo]);

  useEffect(()=>{
    if(search.get('github')==='syncing'&&project.githubRepo&&!phase)syncAndFinish();
  },[search,project.githubRepo]);

  async function link(){
    if(!selected)return;
    setBusy(true);
    setPhase('connecting');
    setMessage('Piesaistām izvēlēto repozitoriju projektam…');
    try{
      const r=await fetch('/api/github/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,repoId:Number(selected)})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Could not link repository');
      await syncAndFinish();
    }catch(e){setPhase('error');setMessage(e.message||'Neizdevās pieslēgt GitHub.');}
    finally{setBusy(false)}
  }

  return <>
    {project.githubRepo?<div className="inline-row"><a className="btn secondary" href={`https://github.com/${project.githubOwner}/${project.githubRepo}`} target="_blank" rel="noreferrer"><Github size={16}/>{project.githubOwner}/{project.githubRepo}</a>{project.githubInstallationId&&<a className="btn secondary" href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={16}/> Manage access</a>}</div>:
    !project.githubInstallationId?<a className="btn secondary" href={`/api/github/install?projectId=${project.id}`}><Github size={16}/> Connect GitHub</a>:
    <div className="repo-connect"><select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">Select repository…</option>{repos.map(r=><option key={r.id} value={r.id}>{r.fullName}{r.private?' · private':''}</option>)}</select><button className="btn secondary" onClick={link} disabled={!selected||busy}>{busy?<Loader2 size={16} className="spin"/>:<Link2 size={16}/>} Link</button><button className="btn secondary" onClick={load} disabled={busy}><RefreshCw size={16}/> Refresh</button><a className="btn secondary" href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={16}/> Manage GitHub access</a></div>}

    {phase&&<div className="github-loader-backdrop"><div className="github-loader-card">{phase==='done'?<CheckCircle2 size={38} className="github-loader-success"/>:<Loader2 size={38} className="spin"/>}<div><h3>{phase==='error'?'GitHub connection failed':phase==='done'?'GitHub connected':'Connecting GitHub…'}</h3><p>{message}</p>{phase==='error'&&<button className="btn secondary" onClick={()=>setPhase('')}>Close</button>}</div></div></div>}
  </>;
}
