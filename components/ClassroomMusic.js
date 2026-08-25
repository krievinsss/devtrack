'use client';
import { useEffect,useMemo,useState } from 'react';
import { Ban,Check,CircleDollarSign,Clock3,Headphones,LockKeyhole,Music2,PauseCircle,Play,ShieldAlert,Trash2,UserRoundPlus } from 'lucide-react';

export default function ClassroomMusic({user}){
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [form,setForm]=useState({title:'',artist:'',spotifyUrl:''});
  const [banForm,setBanForm]=useState({studentId:'',durationMinutes:60,reason:'',severity:'medium',fine:500});
  const isStudent=user.role==='student';

  async function load(){
    setLoading(true);setError('');
    try{const r=await fetch('/api/music',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not load music');setData(d);}catch(e){setError(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  async function act(payload,key=payload.action){
    if(busy)return;setBusy(key);setError('');
    try{const r=await fetch('/api/music',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Action failed');await load();return true;}catch(e){setError(e.message);return false}finally{setBusy('')}
  }

  const activeBan=useMemo(()=>data?.access?.banUntil&&new Date(data.access.banUntil).getTime()>Date.now(),[data?.access?.banUntil]);
  const rulesNeeded=isStudent&&data&&data.access?.acceptedRulesVersion!==data.rulesVersion;
  const myRequest=isStudent?data?.queue?.find(x=>x.studentId===user.id&&['requested','approved','queued'].includes(x.status)):null;

  if(loading)return <div className="music-loading"><Music2 size={24}/><span>Loading Classroom Music…</span></div>;
  if(!data)return <div className="notice danger">{error||'Classroom Music unavailable.'}</div>;

  return <div className="music-page">
    <section className="music-hero">
      <div><span className="eyebrow">CLASSROOM MUSIC</span><h1>One classroom. One queue.</h1><p>Request a song, keep the vibe respectful and let the lesson soundtrack build itself.</p></div>
      <div className={`music-status ${data.settings.requestsEnabled?'open':'paused'}`}><Headphones size={18}/><div><b>{data.settings.requestsEnabled?'Requests open':'Requests paused'}</b><span>{data.settings.spotifyConnected?'Spotify connected':'Spotify connection coming next'}</span></div></div>
    </section>

    {error&&<div className="notice danger">{error}</div>}

    {isStudent?<StudentView data={data} user={user} form={form} setForm={setForm} myRequest={myRequest} activeBan={activeBan} busy={busy} act={act}/>:<AdminView data={data} banForm={banForm} setBanForm={setBanForm} busy={busy} act={act}/>} 

    {rulesNeeded&&<RulesModal rules={data.rules} busy={busy} accept={()=>act({action:'accept_rules'},'accept_rules')}/>} 
  </div>
}

function StudentView({data,user,form,setForm,myRequest,activeBan,busy,act}){
  const blocked=activeBan||Number(data.access?.fineDue||0)>0||!data.settings.requestsEnabled;
  return <>
    {(activeBan||data.access?.fineDue>0)&&<section className="music-penalty-card"><div className="music-penalty-icon"><Ban size={24}/></div><div><span className="eyebrow">MUSIC ACCESS RESTRICTED</span><h2>{activeBan?'Temporary ban active':'Fine payment required'}</h2>{activeBan&&<p>Access returns <b>{new Date(data.access.banUntil).toLocaleString('lv-LV')}</b>. Reason: {data.access.banReason||'Rules violation'}.</p>}{Number(data.access?.fineDue||0)>0&&<p>Before requesting music again, pay the <b>{data.access.fineDue} DC</b> classroom music fine.</p>}</div>{Number(data.access?.fineDue||0)>0&&<button className="btn primary" disabled={busy==='pay_fine'} onClick={()=>act({action:'pay_fine'},'pay_fine')}><CircleDollarSign size={16}/>{busy==='pay_fine'?'Paying…':`Pay ${data.access.fineDue} DC`}</button>}</section>}

    <div className="music-layout">
      <main>
        <section className="panel music-request-panel"><div className="panel-title"><div><h3><Music2 size={17}/> Request a song</h3><small>One active request per student.</small></div></div>{myRequest?<div className="my-song-request"><div><span>Your request</span><h3>{myRequest.title}</h3><p>{myRequest.artist||'Unknown artist'} · {statusText(myRequest.status)}</p></div><button className="btn secondary compact" disabled={busy===myRequest.id} onClick={()=>act({action:'remove_request',requestId:myRequest.id},myRequest.id)}><Trash2 size={14}/> Remove</button></div>:<form className="music-request-form" onSubmit={async e=>{e.preventDefault();const ok=await act({action:'request',...form},'request');if(ok)setForm({title:'',artist:'',spotifyUrl:''})}}><label><span>Song title</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. 505" disabled={blocked}/></label><label><span>Artist</span><input value={form.artist} onChange={e=>setForm({...form,artist:e.target.value})} placeholder="Arctic Monkeys" disabled={blocked}/></label><label className="wide"><span>Spotify link <small>optional for now</small></span><input value={form.spotifyUrl} onChange={e=>setForm({...form,spotifyUrl:e.target.value})} placeholder="https://open.spotify.com/track/..." disabled={blocked}/></label><button className="btn primary" disabled={blocked||busy==='request'}><UserRoundPlus size={16}/>{busy==='request'?'Adding…':'Add to classroom queue'}</button></form>}</section>
        <Queue queue={data.queue}/>
      </main>
      <aside><section className="panel music-rules-mini"><div className="panel-title"><div><h3><ShieldAlert size={17}/> Queue rules</h3><small>Accepted classroom policy</small></div></div>{data.rules.map((r,i)=><div className="music-rule-mini" key={r}><span>{i+1}</span><p>{r}</p></div>)}</section></aside>
    </div>
  </>
}

function AdminView({data,banForm,setBanForm,busy,act}){
  return <div className="music-admin-layout"><main><section className="panel music-admin-controls"><div className="panel-title"><div><h3><Headphones size={17}/> Classroom controls</h3><small>Teacher moderation</small></div><button className="btn secondary compact" disabled={busy==='toggle'} onClick={()=>act({action:'toggle_requests',enabled:!data.settings.requestsEnabled},'toggle')} >{data.settings.requestsEnabled?<><PauseCircle size={14}/> Pause requests</>:<><Play size={14}/> Open requests</>}</button></div></section><Queue queue={data.queue} admin busy={busy} act={act}/></main><aside><section className="panel"><div className="panel-title"><div><h3><Ban size={17}/> Restrict music access</h3><small>Ban + optional DevCredits fine</small></div></div><div className="music-ban-form"><label><span>Student</span><select value={banForm.studentId} onChange={e=>setBanForm({...banForm,studentId:e.target.value})}><option value="">Choose student…</option>{data.students.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><div className="music-ban-row"><label><span>Duration</span><select value={banForm.durationMinutes} onChange={e=>setBanForm({...banForm,durationMinutes:Number(e.target.value)})}><option value={30}>30 min</option><option value={60}>1 hour</option><option value={240}>4 hours</option><option value={1440}>1 day</option><option value={4320}>3 days</option><option value={10080}>7 days</option><option value={43200}>30 days</option></select></label><label><span>Severity</span><select value={banForm.severity} onChange={e=>setBanForm({...banForm,severity:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div><label><span>Reason</span><textarea value={banForm.reason} onChange={e=>setBanForm({...banForm,reason:e.target.value})} placeholder="Why is access being restricted?"/></label><label><span>Fine (DC)</span><input type="number" min="0" value={banForm.fine} onChange={e=>setBanForm({...banForm,fine:Number(e.target.value)})}/></label><button className="btn danger" disabled={!banForm.studentId||!banForm.reason||busy==='ban'} onClick={()=>act({action:'ban_student',...banForm},'ban')}><Ban size={15}/>{busy==='ban'?'Applying…':'Apply restriction'}</button></div></section><section className="panel music-access-list"><div className="panel-title"><div><h3><LockKeyhole size={17}/> Student access</h3><small>Current restrictions</small></div></div>{data.students.filter(s=>s.access?.banUntil||s.access?.fineDue).map(s=><div className="music-access-row" key={s.id}><div><b>{s.name}</b><small>{s.access?.banUntil?`Ban until ${new Date(s.access.banUntil).toLocaleString('lv-LV')}`:'No active ban'}{s.access?.fineDue?` · ${s.access.fineDue} DC due`:''}</small></div><button className="btn secondary compact" onClick={()=>act({action:'unban_student',studentId:s.id},`unban_${s.id}`)}>Unban</button></div>)}{!data.students.some(s=>s.access?.banUntil||s.access?.fineDue)&&<p className="music-empty">No students currently restricted.</p>}</section></aside></div>
}

function Queue({queue,admin=false,busy,act}){
  return <section className="panel music-queue-panel"><div className="panel-title"><div><h3><Clock3 size={17}/> Classroom queue</h3><small>{queue.length} requests</small></div></div>{queue.length?<div className="music-queue-list">{queue.map((q,i)=><div className="music-queue-row" key={q.id}><div className="music-position">{i+1}</div><div className="music-song"><b>{q.title}</b><span>{q.artist||'Unknown artist'}</span><small>Requested by {q.studentName}</small></div><span className={`music-state ${q.status}`}>{statusText(q.status)}</span>{admin&&<div className="music-admin-actions">{q.status==='requested'&&<button onClick={()=>act({action:'moderate_request',requestId:q.id,status:'approved'},`approve_${q.id}`)}><Check size={14}/></button>}<button onClick={()=>act({action:'moderate_request',requestId:q.id,status:'removed'},`remove_${q.id}`)}><Trash2 size={14}/></button></div>}</div>)}</div>:<div className="music-empty-state"><Music2 size={26}/><b>The queue is empty.</b><span>Someone has to choose the first song.</span></div>}</section>
}
function RulesModal({rules,busy,accept}){return <div className="music-rules-backdrop"><div className="music-rules-modal"><div className="music-rules-icon"><ShieldAlert size={28}/></div><span className="eyebrow">BEFORE YOU ENTER</span><h2>Classroom Music rules</h2><p>This queue is part of the classroom environment. Misuse can result in a temporary ban and a DevCredits fine.</p><div className="music-rules-list">{rules.map((rule,i)=><div key={rule}><span>{i+1}</span><p>{rule}</p></div>)}</div><div className="music-warning"><CircleDollarSign size={16}/><span>Typical penalty for inappropriate use: temporary ban + <b>500 DC</b>.</span></div><button className="btn primary" disabled={busy==='accept_rules'} onClick={accept}>{busy==='accept_rules'?'Saving…':'I understand and agree'}</button></div></div>}
function statusText(status){return ({requested:'Waiting approval',approved:'Approved',queued:'In Spotify queue',played:'Played',removed:'Removed'})[status]||status}
