'use client';
import { useEffect,useRef,useState } from 'react';
import { useRouter,useSearchParams } from 'next/navigation';
import { Github,Link2,Loader2,RefreshCw,Settings,CheckCircle2,AlertTriangle } from 'lucide-react';

const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

export default function GitHubConnect({project}){
  const router=useRouter();
  const search=useSearchParams();
  const [repos,setRepos]=useState([]);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState('');
  const [phase,setPhase]=useState('');
  const [message,setMessage]=useState('');
  const running=useRef(false);

  async function status(){
    const r=await fetch(`/api/github/status?projectId=${encodeURIComponent(project.id)}&t=${Date.now()}`,{cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Could not read GitHub status');
    return d;
  }

  async function load(){
    if(!project.githubInstallationId)return;
    setBusy(true);
    try{const r=await fetch(`/api/github/repos?installationId=${project.githubInstallationId}`,{cache:'no-store'});const d=await r.json();setRepos(d.repos||[])}
    finally{setBusy(false)}
  }

  async function waitForLinked(maxMs=30000){
    const started=Date.now();
    while(Date.now()-started<maxMs){
      try{const s=await status();if(s.linked)return s;}catch{}
      await sleep(1200);
    }
    return null;
  }

  async function waitForSync(maxMs=60000){
    const started=Date.now();
    while(Date.now()-started<maxMs){
      try{const s=await status();if(s.synced)return s;}catch{}
      await sleep(1500);
    }
    return null;
  }

  async function finishReady(s){
    setPhase('done');
    setMessage(`${s?.owner||project.githubOwner}/${s?.repo||project.githubRepo} ir pieslēgts un sinhronizēts.`);
    router.replace(`/projects/${project.id}`);
    router.refresh();
    await sleep(900);
    setPhase('');
  }

  async function syncAndFinish(){
    if(running.current)return;
    running.current=true;
    setPhase('connecting');
    setMessage('Pārbaudām, vai repozitorijs ir saglabāts DevTrack…');
    try{
      const linked=await waitForLinked();
      if(!linked){
        setPhase('waiting');
        setMessage('GitHub instalācija ir apstiprināta. Vēl gaidām, kamēr repozitorijs parādās DevTrack…');
        const later=await waitForLinked(45000);
        if(!later)throw new Error('Repository link was not confirmed in time');
      }

      const before=await status();
      if(before.synced){await finishReady(before);return;}

      setPhase('syncing');
      setMessage('Repozitorijs ir pieslēgts. Ielādējam commit vēsturi un statistiku…');

      let syncRequestFailed=false;
      try{
        const r=await fetch('/api/github/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id})});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)syncRequestFailed=true;
      }catch{syncRequestFailed=true;}

      const synced=await waitForSync(syncRequestFailed?75000:30000);
      if(synced){await finishReady(synced);return;}

      const current=await status().catch(()=>null);
      if(current?.linked){
        setPhase('linked');
        setMessage('Repozitorijs ir pieslēgts. Commit sinhronizācija vēl turpinās — vari turpināt darbu, DevTrack to pabeigs, tiklīdz dati būs pieejami.');
        router.replace(`/projects/${project.id}`);
        router.refresh();
        return;
      }

      throw new Error('GitHub repository was not linked');
    }catch(e){
      const current=await status().catch(()=>null);
      if(current?.linked){
        setPhase('linked');
        setMessage('Repozitorijs ir pieslēgts. Sinhronizācija vēl nav pabeigta, bet savienojums ir veiksmīgs.');
        router.replace(`/projects/${project.id}`);
        router.refresh();
      }else{
        setPhase('error');
        setMessage(e.message||'Neizdevās pieslēgt GitHub.');
      }
    }finally{running.current=false;}
  }

  useEffect(()=>{
    if(project.githubInstallationId&&!project.githubRepo)load();
  },[project.githubInstallationId,project.githubRepo]);

  useEffect(()=>{
    if(search.get('github')==='syncing'&&!phase)syncAndFinish();
  },[search]);

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
    }catch(e){
      const current=await status().catch(()=>null);
      if(current?.linked){setPhase('linked');setMessage('Repozitorijs ir pieslēgts. Sinhronizācija vēl turpinās.');router.refresh();}
      else{setPhase('error');setMessage(e.message||'Neizdevās pieslēgt GitHub.');}
    }finally{setBusy(false)}
  }

  return <>
    {project.githubRepo?<div className="inline-row"><a className="btn secondary" href={`https://github.com/${project.githubOwner}/${project.githubRepo}`} target="_blank" rel="noreferrer"><Github size={16}/>{project.githubOwner}/{project.githubRepo}</a>{project.githubInstallationId&&<a className="btn secondary" href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={16}/> Manage access</a>}</div>:
    !project.githubInstallationId?<a className="btn secondary" href={`/api/github/install?projectId=${project.id}`}><Github size={16}/> Connect GitHub</a>:
    <div className="repo-connect"><select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy}><option value="">Select repository…</option>{repos.map(r=><option key={r.id} value={r.id}>{r.fullName}{r.private?' · private':''}</option>)}</select><button className="btn secondary" onClick={link} disabled={!selected||busy}>{busy?<Loader2 size={16} className="spin"/>:<Link2 size={16}/>} Link</button><button className="btn secondary" onClick={load} disabled={busy}><RefreshCw size={16}/> Refresh</button><a className="btn secondary" href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={16}/> Manage GitHub access</a></div>}

    {phase&&<div className="github-loader-backdrop"><div className="github-loader-card">{phase==='done'?<CheckCircle2 size={38} className="github-loader-success"/>:phase==='error'?<AlertTriangle size={38}/>:phase==='linked'?<CheckCircle2 size={38} className="github-loader-success"/>:<Loader2 size={38} className="spin"/>}<div><h3>{phase==='error'?'GitHub connection failed':phase==='done'?'GitHub ready':phase==='linked'?'GitHub connected':phase==='syncing'?'Syncing GitHub…':'Connecting GitHub…'}</h3><p>{message}</p>{(phase==='error'||phase==='linked')&&<button className="btn secondary" onClick={()=>setPhase('')}>Continue</button>}</div></div></div>}
  </>;
}
