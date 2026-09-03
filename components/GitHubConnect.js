'use client';

import { useCallback,useEffect,useRef,useState } from 'react';
import { useRouter,useSearchParams } from 'next/navigation';
import { AlertTriangle,CheckCircle2,ExternalLink,Github,Link2,Loader2,RefreshCw,Settings,X } from 'lucide-react';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export default function GitHubConnect({project}){
  const router=useRouter();
  const search=useSearchParams();
  const running=useRef(false);
  const [repos,setRepos]=useState([]);
  const [busy,setBusy]=useState(false);
  const [selected,setSelected]=useState('');
  const [phase,setPhase]=useState('');
  const [message,setMessage]=useState('');
  const [menu,setMenu]=useState(false);
  const [picker,setPicker]=useState(false);
  const [repoError,setRepoError]=useState('');

  const status=useCallback(async()=>{
    const response=await fetch(`/api/github/status?projectId=${encodeURIComponent(project.id)}&t=${Date.now()}`,{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Could not read GitHub status');
    return data;
  },[project.id]);

  const loadRepositories=useCallback(async()=>{
    if(!project.githubInstallationId)return;
    setBusy(true);
    setRepoError('');
    try{
      const response=await fetch(`/api/github/repos?installationId=${project.githubInstallationId}&t=${Date.now()}`,{cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Neizdevās ielādēt repozitorijus.');
      setRepos(data.repos||[]);
    }catch(error){
      setRepoError(error.message||'Neizdevās ielādēt repozitorijus.');
    }finally{
      setBusy(false);
    }
  },[project.githubInstallationId]);

  const waitForLinked=useCallback(async(maxMs=30000)=>{
    const started=Date.now();
    while(Date.now()-started<maxMs){
      try{const current=await status();if(current.linked)return current}catch{}
      await sleep(1000);
    }
    return null;
  },[status]);

  const finishConnected=useCallback(async current=>{
    setPicker(false);
    setPhase('done');
    setMessage(`${current?.owner||project.githubOwner}/${current?.repo||project.githubRepo} ir pieslēgts.`);
    router.replace(`/projects/${project.id}`);
    router.refresh();
    await sleep(650);
    setPhase('');
  },[project.githubOwner,project.githubRepo,project.id,router]);

  const syncInBackground=useCallback(()=>{
    fetch('/api/github/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id})})
      .then(response=>{if(response.ok)router.refresh()})
      .catch(()=>{});
  },[project.id,router]);

  const connectFlow=useCallback(async()=>{
    if(running.current)return;
    running.current=true;
    setPhase('connecting');
    setMessage('Pārbaudām GitHub savienojumu…');
    try{
      const linked=await waitForLinked(45000);
      if(!linked)throw new Error('Repository link was not confirmed in time');
      syncInBackground();
      await finishConnected(linked);
    }catch(error){
      const current=await status().catch(()=>null);
      if(current?.linked){
        syncInBackground();
        await finishConnected(current);
      }else{
        setPhase('error');
        setMessage(error.message||'Neizdevās pieslēgt GitHub.');
      }
    }finally{
      running.current=false;
    }
  },[finishConnected,status,syncInBackground,waitForLinked]);

  useEffect(()=>{
    if(project.githubInstallationId&&!project.githubRepo){
      const timer=setTimeout(()=>loadRepositories(),0);
      return()=>clearTimeout(timer);
    }
  },[loadRepositories,project.githubInstallationId,project.githubRepo]);

  useEffect(()=>{
    if(search.get('github')==='syncing'&&!phase){
      const timer=setTimeout(()=>connectFlow(),0);
      return()=>clearTimeout(timer);
    }
  },[connectFlow,phase,search]);

  async function linkRepository(event){
    event?.preventDefault();
    if(!selected)return;
    setBusy(true);
    setPhase('connecting');
    setMessage(project.githubRepo?'Mainām projekta repozitoriju…':'Piesaistām izvēlēto repozitoriju…');
    try{
      const response=await fetch('/api/github/link',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id,repoId:Number(selected)})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Could not link repository');
      syncInBackground();
      await finishConnected({owner:data.project?.githubOwner,repo:data.project?.githubRepo});
    }catch(error){
      setPhase('error');
      setMessage(error.message||'Neizdevās pieslēgt GitHub.');
    }finally{
      setBusy(false);
    }
  }

  async function manualSync(){
    setMenu(false);
    setPhase('connecting');
    setMessage('Atjaunojam GitHub datus…');
    try{
      const response=await fetch('/api/github/sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:project.id})});
      if(!response.ok)throw new Error();
      setPhase('done');
      setMessage('GitHub dati atjaunoti.');
      router.refresh();
      await sleep(650);
      setPhase('');
    }catch{
      setPhase('error');
      setMessage('Neizdevās atjaunot GitHub datus.');
    }
  }

  function openRepositoryPicker(){
    setMenu(false);
    setSelected('');
    setRepos([]);
    setPicker(true);
    loadRepositories();
  }

  const repositoryOptions=repos.map(repo=>{
    const current=repo.owner===project.githubOwner&&repo.name===project.githubRepo;
    return <option key={repo.id} value={repo.id} disabled={current}>{repo.fullName}{current?' · pašreizējais':repo.private?' · private':''}</option>;
  });

  return <>
    {project.githubRepo?<div className="github-compact">
      <div className="github-status"><CheckCircle2 size={16}/><span><b>GitHub connected</b><small>{project.githubOwner}/{project.githubRepo}</small></span></div>
      <div className="github-settings-wrap">
        <button className="icon-btn" onClick={()=>setMenu(!menu)} title="GitHub settings"><Settings size={17}/></button>
        {menu&&<div className="github-menu">
          <button onClick={openRepositoryPicker}><Link2 size={15}/> Mainīt repozitoriju</button>
          <button onClick={manualSync}><RefreshCw size={15}/> Sync now</button>
          <a href={`https://github.com/${project.githubOwner}/${project.githubRepo}`} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Open repository</a>
          <a href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer"><Settings size={15}/> Manage access</a>
        </div>}
      </div>
    </div>:
    !project.githubInstallationId?<a className="btn secondary" href={`/api/github/install?projectId=${project.id}`}><Github size={16}/> Connect GitHub</a>:
    <div className="repo-connect">
      <select value={selected} onChange={event=>setSelected(event.target.value)} disabled={busy}><option value="">Select repository…</option>{repositoryOptions}</select>
      <button className="btn primary" onClick={linkRepository} disabled={!selected||busy}>{busy?<Loader2 size={16} className="spin"/>:<Link2 size={16}/>} Link repository</button>
      {repoError&&<small className="github-repo-error">{repoError}</small>}
    </div>}

    {picker&&<div className="github-repo-backdrop" onMouseDown={()=>!busy&&setPicker(false)}>
      <form className="github-repo-modal" onSubmit={linkRepository} onMouseDown={event=>event.stopPropagation()}>
        <div className="github-repo-modal-head">
          <div><span className="eyebrow">GITHUB SETTINGS</span><h2>Mainīt repozitoriju</h2><p>Izvēlies pareizo GitHub repozitoriju šim projektam.</p></div>
          <button className="icon-btn" type="button" disabled={busy} onClick={()=>setPicker(false)} aria-label="Aizvērt"><X size={18}/></button>
        </div>
        <div className="github-repo-modal-body">
          <div className="github-current-repo"><CheckCircle2 size={18}/><span><small>Pašreizējais repozitorijs</small><b>{project.githubOwner}/{project.githubRepo}</b></span></div>
          <label>Jaunais repozitorijs
            <select value={selected} onChange={event=>setSelected(event.target.value)} disabled={busy} required>
              <option value="">Izvēlies repozitoriju…</option>
              {repositoryOptions}
            </select>
          </label>
          {busy&&!repos.length&&<div className="github-repo-loading"><Loader2 size={16} className="spin"/> Ielādē repozitorijus…</div>}
          {repoError&&<div className="form-error">{repoError}</div>}
          <p className="github-repo-note">Pēc maiņas vecā repozitorija commit dati tiks noņemti un DevTrack automātiski ielādēs jaunā repozitorija vēsturi.</p>
          <p className="github-repo-help">Neredzi vajadzīgo repo? <a href={`https://github.com/settings/installations/${project.githubInstallationId}`} target="_blank" rel="noreferrer">Atļauj tam piekļuvi GitHub iestatījumos <ExternalLink size={12}/></a></p>
        </div>
        <div className="github-repo-modal-actions">
          <button className="btn secondary" type="button" disabled={busy} onClick={()=>setPicker(false)}>Atcelt</button>
          <button className="btn primary" disabled={!selected||busy}>{busy?<Loader2 size={16} className="spin"/>:<RefreshCw size={16}/>} Nomainīt repozitoriju</button>
        </div>
      </form>
    </div>}

    {phase&&<div className="github-loader-backdrop"><div className="github-loader-card">
      {phase==='done'?<CheckCircle2 size={38} className="github-loader-success"/>:phase==='error'?<AlertTriangle size={38}/>:<Loader2 size={38} className="spin"/>}
      <div><h3>{phase==='error'?'GitHub connection failed':phase==='done'?'GitHub connected':'Connecting GitHub…'}</h3><p>{message}</p>{phase==='error'&&<button className="btn secondary" onClick={()=>setPhase('')}>Close</button>}</div>
    </div></div>}
  </>;
}
