'use client';
import { useEffect,useMemo,useRef,useState } from 'react';
import { Ban,Check,CircleDollarSign,Clock3,Headphones,Music2,PauseCircle,Play,Search,ShieldAlert,Trash2,X } from 'lucide-react';

export default function ClassroomMusic({user}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [searching,setSearching]=useState(false);
  const [nowPlaying,setNowPlaying]=useState(null);
  const [banForm,setBanForm]=useState({studentId:'',durationMinutes:60,reason:'',severity:'medium',fine:500});
  const searchTimer=useRef(null);
  const isStudent=user.role==='student';

  async function load({silent=false}={}){
    if(silent)setRefreshing(true);else setLoading(true);
    try{
      const r=await fetch(`/api/music?t=${Date.now()}`,{cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Could not load music');
      setData(d);
      if(d.settings.spotifyConnected){
        const s=await fetch(`/api/spotify?t=${Date.now()}`,{cache:'no-store'});
        const sd=await s.json();
        if(s.ok)setNowPlaying(sd.nowPlaying||null);
      }else setNowPlaying(null);
      setError('');
    }catch(e){setError(e.message)}finally{setLoading(false);setRefreshing(false)}
  }

  useEffect(()=>{
    load();
    const timer=setInterval(()=>load({silent:true}),5000);
    const focus=()=>load({silent:true});
    const visible=()=>{if(document.visibilityState==='visible')load({silent:true})};
    window.addEventListener('focus',focus);
    document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visible)};
  },[]);

  async function act(payload,key=payload.action){
    if(busy)return false;
    setBusy(key);setError('');
    try{
      const r=await fetch('/api/music',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Action failed');
      await load({silent:true});
      window.dispatchEvent(new Event('devtrack-data-refresh'));
      return true;
    }catch(e){setError(e.message);return false}finally{setBusy('')}
  }

  async function searchSpotify(term=query){
    const q=term.trim();
    if(q.length<2){setResults([]);return}
    setSearching(true);setError('');
    try{
      const r=await fetch(`/api/spotify?q=${encodeURIComponent(q)}&t=${Date.now()}`,{cache:'no-store'});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Spotify search failed');
      setResults(d.results||[]);setNowPlaying(d.nowPlaying||null);
    }catch(e){setError(e.message)}finally{setSearching(false)}
  }

  function changeQuery(value){
    setQuery(value);
    clearTimeout(searchTimer.current);
    if(value.trim().length<2){setResults([]);return}
    searchTimer.current=setTimeout(()=>searchSpotify(value),350);
  }

  const activeBan=useMemo(()=>data?.access?.banUntil&&new Date(data.access.banUntil).getTime()>Date.now(),[data?.access?.banUntil]);
  const rulesNeeded=isStudent&&data&&data.access?.acceptedRulesVersion!==data.rulesVersion;
  const myRequest=isStudent?data?.queue?.find(x=>x.studentId===user.id&&['requested','approved','queued'].includes(x.status)):null;

  if(loading&&!data)return <div className="music-loading"><Music2 size={24}/><span>Loading Classroom Music…</span></div>;
  if(!data)return <div className="notice danger">{error||'Classroom Music unavailable.'}</div>;

  return <div className="music-page">
    <section className="music-hero">
      <div><span className="eyebrow">CLASSROOM MUSIC</span><h1>One classroom. One queue.</h1><p>Search Spotify, request a track and keep the classroom soundtrack respectful.</p></div>
      <div className="music-hero-statuses">
        {refreshing&&<span className="music-live-dot">Syncing</span>}
        <div className={`music-status ${data.settings.requestsEnabled?'open':'paused'}`}><Headphones size={18}/><div><b>{data.settings.requestsEnabled?'Requests open':'Requests paused'}</b><span>{data.settings.spotifyConnected?'Spotify connected':'Spotify not connected'}</span></div></div>
      </div>
    </section>

    {nowPlaying&&<section className="music-now-playing"><div className="music-now-cover">{nowPlaying.image?<img src={nowPlaying.image} alt=""/>:<Music2 size={22}/>}<span className={nowPlaying.isPlaying?'playing':''}/></div><div className="music-now-copy"><span className="eyebrow">NOW PLAYING</span><h2>{nowPlaying.title}</h2><p>{nowPlaying.artist}</p><div className="music-now-progress"><span style={{width:`${Math.min(100,Math.round((nowPlaying.progressMs||0)/Math.max(1,nowPlaying.durationMs||1)*100))}%`}}/></div></div></section>}

    {error&&<div className="notice danger music-error">{error}</div>}
    {isStudent?<StudentView data={data} query={query} changeQuery={changeQuery} setQuery={setQuery} results={results} setResults={setResults} searching={searching} myRequest={myRequest} activeBan={activeBan} busy={busy} act={act}/>:<AdminView data={data} banForm={banForm} setBanForm={setBanForm} busy={busy} act={act}/>} 
    {rulesNeeded&&<RulesModal rules={data.rules} busy={busy} accept={()=>act({action:'accept_rules'},'accept_rules')}/>} 
  </div>
}

function StudentView({data,query,changeQuery,setQuery,results,setResults,searching,myRequest,activeBan,busy,act}){
  const blocked=activeBan||Number(data.access?.fineDue||0)>0||!data.settings.requestsEnabled;
  return <>
    <Penalty data={data} activeBan={activeBan} busy={busy} act={act}/>
    <div className="music-layout">
      <main>
        <section className="panel music-request-panel"><div className="panel-title"><div><h3><Music2 size={17}/> Request a song</h3><small>One active request per student.</small></div></div>
          {myRequest?<div className="my-song-request">{myRequest.image?<img src={myRequest.image} alt=""/>:<div className="music-thumb-fallback"><Music2 size={18}/></div>}<div className="my-song-copy"><span>Your request</span><h3>{myRequest.title}</h3><p>{myRequest.artist} · {statusText(myRequest.status)}</p></div><button className="btn secondary compact" disabled={busy===myRequest.id} onClick={()=>act({action:'remove_request',requestId:myRequest.id},myRequest.id)}><Trash2 size={14}/> Remove</button></div>:
          data.settings.spotifyConnected?<><div className="spotify-search-wrap"><div className="spotify-search"><Search size={17}/><input value={query} onChange={e=>changeQuery(e.target.value)} placeholder="Search song, artist or album…" disabled={blocked}/>{query&&<button className="spotify-clear" type="button" onClick={()=>{setQuery('');setResults([])}}><X size={14}/></button>}<span>{searching?'Searching…':'Spotify'}</span></div>{results.length>0&&<div className="spotify-results">{results.map(t=><button key={t.id} className="spotify-result" disabled={blocked||busy===t.id} onClick={async()=>{const ok=await act({action:'request',title:t.title,artist:t.artist,spotifyUrl:t.spotifyUrl,spotifyId:t.id,spotifyUri:t.uri,image:t.image,durationMs:t.durationMs,explicit:t.explicit},t.id);if(ok){setQuery('');setResults([])}}}>{t.image?<img src={t.image} alt=""/>:<div className="spotify-cover"><Music2 size={17}/></div>}<span><b>{t.title}</b><small>{t.artist}{t.explicit?' · E':''}</small></span><strong>+ Add</strong></button>)}</div>}</div></>:<div className="music-empty-state"><Music2/><b>Spotify is not connected yet.</b><span>Ask the teacher to connect Spotify from this page.</span></div>}
        </section>
        <Queue queue={data.queue}/>
      </main>
      <aside><RulesMini rules={data.rules}/></aside>
    </div>
  </>
}

function AdminView({data,banForm,setBanForm,busy,act}){return <div className="music-admin-layout"><main><section className="panel music-admin-controls"><div className="panel-title"><div><h3><Headphones size={17}/> Classroom controls</h3><small>Teacher moderation</small></div><div className="music-admin-actions">{!data.spotifyConnected&&<a className="btn primary compact" href="/api/spotify/connect">Connect Spotify</a>}<button className="btn secondary compact" onClick={()=>act({action:'toggle_requests',enabled:!data.settings.requestsEnabled},'toggle')}>{data.settings.requestsEnabled?<><PauseCircle size={14}/> Pause requests</>:<><Play size={14}/> Open requests</>}</button></div></div></section><Queue queue={data.queue} admin busy={busy} act={act}/></main><aside><section className="panel"><div className="panel-title"><div><h3><Ban size={17}/> Restrict music access</h3><small>Ban + optional DevCredits fine</small></div></div><div className="music-ban-form"><label><span>Student</span><select value={banForm.studentId} onChange={e=>setBanForm({...banForm,studentId:e.target.value})}><option value="">Choose student…</option>{data.students.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><div className="music-ban-row"><label><span>Duration</span><select value={banForm.durationMinutes} onChange={e=>setBanForm({...banForm,durationMinutes:Number(e.target.value)})}><option value={30}>30 min</option><option value={60}>1 hour</option><option value={240}>4 hours</option><option value={1440}>1 day</option><option value={10080}>7 days</option><option value={43200}>30 days</option></select></label><label><span>Severity</span><select value={banForm.severity} onChange={e=>setBanForm({...banForm,severity:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label><span>Reason</span><textarea value={banForm.reason} onChange={e=>setBanForm({...banForm,reason:e.target.value})}/></label><label><span>Fine (DC)</span><input type="number" min="0" value={banForm.fine} onChange={e=>setBanForm({...banForm,fine:Number(e.target.value)})}/></label><button className="btn danger" disabled={!banForm.studentId||!banForm.reason||busy==='ban'} onClick={()=>act({action:'ban_student',...banForm},'ban')}><Ban size={15}/> {busy==='ban'?'Applying…':'Apply restriction'}</button></div></section></aside></div>}

function Queue({queue,admin=false,act}){return <section className="panel music-queue-panel"><div className="panel-title"><div><h3><Clock3 size={17}/> Classroom queue</h3><small>{queue.length} request{queue.length===1?'':'s'}</small></div></div>{queue.length?<div className="music-queue-list">{queue.map((q,i)=><div className="music-queue-row" key={q.id}>{q.image?<img className="music-queue-cover" src={q.image} alt=""/>:<div className="music-queue-cover music-thumb-fallback"><Music2 size={16}/></div>}<div className="music-position">{i+1}</div><div className="music-song"><b>{q.title}</b><span>{q.artist}</span><small>Requested by {q.studentName}</small></div><span className={`music-state ${q.status}`}>{statusText(q.status)}</span>{admin&&<div className="music-admin-actions">{q.status==='requested'&&<button title="Approve" onClick={()=>act({action:'moderate_request',requestId:q.id,status:'approved'},`approve_${q.id}`)}><Check size={14}/></button>}{q.status==='approved'&&q.spotifyUri&&<button title="Add to Spotify queue" onClick={()=>act({action:'moderate_request',requestId:q.id,status:'queued'},`queue_${q.id}`)}><Play size={14}/></button>}<button title="Remove" onClick={()=>act({action:'moderate_request',requestId:q.id,status:'removed'},`remove_${q.id}`)}><Trash2 size={14}/></button></div>}</div>)}</div>:<div className="music-empty-state"><Music2 size={26}/><b>The queue is empty.</b><span>Someone has to choose the first song.</span></div>}</section>}

function Penalty({data,activeBan,busy,act}){if(!activeBan&&!data.access?.fineDue)return null;return <section className="music-penalty-card"><Ban/><div><h2>{activeBan?'Temporary ban active':'Fine payment required'}</h2>{activeBan&&<p>Until {new Date(data.access.banUntil).toLocaleString('lv-LV')}. {data.access.banReason}</p>}{data.access?.fineDue>0&&<p><b>{data.access.fineDue} DC</b> must be paid before requesting again.</p>}</div>{data.access?.fineDue>0&&<button className="btn primary" disabled={busy==='pay_fine'} onClick={()=>act({action:'pay_fine'},'pay_fine')}><CircleDollarSign size={16}/> Pay {data.access.fineDue} DC</button>}</section>}
function RulesMini({rules}){return <section className="panel music-rules-mini"><div className="panel-title"><h3><ShieldAlert size={17}/> Queue rules</h3></div>{rules.map((r,i)=><div className="music-rule-mini" key={r}><span>{i+1}</span><p>{r}</p></div>)}</section>}
function RulesModal({rules,busy,accept}){return <div className="music-rules-backdrop"><div className="music-rules-modal"><ShieldAlert size={28}/><span className="eyebrow">BEFORE YOU ENTER</span><h2>Classroom Music rules</h2><p>Misuse can result in a temporary ban and a DevCredits fine.</p><div className="music-rules-list">{rules.map((r,i)=><div key={r}><span>{i+1}</span><p>{r}</p></div>)}</div><div className="music-warning"><CircleDollarSign size={16}/><span>Typical penalty: temporary ban + <b>500 DC</b>.</span></div><button className="btn primary" disabled={busy==='accept_rules'} onClick={accept}>{busy==='accept_rules'?'Saving…':'I understand and agree'}</button></div></div>}
function statusText(s){return({requested:'Waiting approval',approved:'Approved',queued:'In Spotify queue',played:'Played'})[s]||s}
