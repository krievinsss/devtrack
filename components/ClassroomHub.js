'use client';
import Link from 'next/link';
import { useMemo,useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive,Armchair,ArrowRight,Check,DoorOpen,LayoutGrid,Plus,QrCode,RotateCcw,Search,UsersRound,X } from 'lucide-react';
import { Badge } from './UI';

const sizes=[['Standard','1000 × 600',1000,600],['Compact','800 × 500',800,500],['Large lab','1400 × 800',1400,800]];

async function mutate(body){
  const response=await fetch('/api/classrooms',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify(body)}),data=await response.json();
  if(!response.ok)throw new Error(data.error||'Classroom operation failed.');
  return data;
}

export default function ClassroomHub({initialClassrooms,staffOptions,canManage,canAssign}){
  const router=useRouter(),[classrooms,setClassrooms]=useState(initialClassrooms||[]),[query,setQuery]=useState(''),[filter,setFilter]=useState('active'),[creator,setCreator]=useState(false),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
  const active=classrooms.filter(room=>room.active),deskCount=active.reduce((sum,room)=>sum+room.desks.length,0),teacherIds=new Set(active.flatMap(room=>room.staff.map(person=>person.userId)));
  const visible=useMemo(()=>{const needle=query.trim().toLowerCase();return classrooms.filter(room=>(filter==='all'||(filter==='active'?room.active:!room.active))&&(!needle||`${room.name} ${room.slug}`.toLowerCase().includes(needle)))},[classrooms,query,filter]);

  async function toggleActive(room){
    if(busy)return;if(room.active&&!confirm(`Archive ${room.name}? Its desk plan and QR codes will stay saved.`))return;
    const previous=classrooms;setBusy(room.id);setError('');setNotice('');setClassrooms(items=>items.map(item=>item.id===room.id?{...item,active:!room.active}:item));
    try{const data=await mutate({action:'setActive',classroomId:room.id,active:!room.active});setClassrooms(items=>items.map(item=>item.id===room.id?data.classroom:item));setNotice(room.active?'Classroom archived.':'Classroom restored.')}catch(cause){setClassrooms(previous);setError(cause.message)}finally{setBusy('')}
  }

  return <div className="classroom-hub">
    {(error||notice)&&<div className={`classroom-notice ${error?'danger':'success'}`}>{error||notice}<button onClick={()=>{setError('');setNotice('')}}><X size={14}/></button></div>}
    <section className="classroom-metrics">
      <Metric icon={DoorOpen} value={active.length} label="Active classrooms" tone="violet"/>
      <Metric icon={Armchair} value={deskCount} label="Desks ready" tone="blue"/>
      <Metric icon={UsersRound} value={teacherIds.size} label="Assigned teachers" tone="green"/>
      <Metric icon={QrCode} value={active.filter(room=>room.desks.length).length} label="QR-ready rooms" tone="amber"/>
    </section>
    <section className="classroom-toolbar">
      <label className="classroom-search"><Search size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search classrooms…"/></label>
      <div className="classroom-filters"><button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Active <span>{active.length}</span></button><button className={filter==='archived'?'active':''} onClick={()=>setFilter('archived')}>Archived <span>{classrooms.length-active.length}</span></button><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All</button></div>
      {canManage&&<button className="btn primary classroom-create-button" onClick={()=>setCreator(true)}><Plus size={16}/> New classroom</button>}
    </section>
    {visible.length?<section className="classroom-grid">{visible.map(room=><ClassroomCard key={room.id} room={room} canManage={canManage&&room.canManage} busy={busy===room.id} onToggle={()=>toggleActive(room)}/>)}</section>:<section className="classroom-empty"><span><LayoutGrid size={26}/></span><h2>{query?'No matching classrooms':filter==='archived'?'No archived classrooms':'Build the first classroom'}</h2><p>{query?'Try a different room name.':filter==='archived'?'Archived rooms will stay here with their layouts and QR codes intact.':'Create a room, place the desks visually, then print permanent QR labels.'}</p>{canManage&&!query&&filter!=='archived'&&<button className="btn primary" onClick={()=>setCreator(true)}><Plus size={15}/> Create classroom</button>}</section>}
    {creator&&<CreateClassroomModal staffOptions={staffOptions} canAssign={canAssign} onClose={()=>setCreator(false)} onCreated={room=>{setClassrooms(items=>[room,...items]);setCreator(false);router.push(`/classrooms/${room.id}`)}}/>}
  </div>;
}

function ClassroomCard({room,canManage,busy,onToggle}){
  const staffNames=room.staff.map(person=>`${person.firstName} ${person.lastName}`),deskCount=room.desks.length;
  return <article className={`classroom-card ${room.active?'':'archived'}`}>
    <div className="classroom-card-map"><MiniMap room={room}/><span className="classroom-card-status"><i/>{room.active?'Active':'Archived'}</span><span className="classroom-card-capacity"><Armchair size={13}/>{deskCount}</span></div>
    <div className="classroom-card-body"><div className="classroom-card-title"><div><span className="eyebrow">{room.slug}</span><h2>{room.name}</h2></div><Badge tone={room.active?'green':'neutral'}>{room.active?'Ready':'Inactive'}</Badge></div>
      <div className="classroom-card-facts"><span><LayoutGrid size={14}/>{room.canvasWidth} × {room.canvasHeight}</span><span><QrCode size={14}/>{deskCount?`${deskCount} permanent codes`:'Add desks first'}</span></div>
      <div className="classroom-card-staff"><div className="classroom-avatar-stack">{room.staff.slice(0,3).map(person=><span key={person.membershipId} title={`${person.firstName} ${person.lastName}`}>{person.firstName?.[0]}{person.lastName?.[0]}</span>)}{room.staff.length>3&&<span>+{room.staff.length-3}</span>}{!room.staff.length&&<span className="no-staff"><UsersRound size={13}/></span>}</div><small>{staffNames.length?staffNames.slice(0,2).join(', '):'School admins only'}{staffNames.length>2?` +${staffNames.length-2}`:''}</small></div>
      <div className="classroom-card-actions"><Link href={`/classrooms/${room.id}`} className="btn primary">{canManage?'Open editor':'View layout'}<ArrowRight size={14}/></Link>{canManage&&deskCount>0&&<Link href={`/classrooms/${room.id}/qr`} className="btn secondary" title="Print QR labels"><QrCode size={15}/></Link>}{canManage&&<button className="btn secondary" disabled={busy} onClick={onToggle} title={room.active?'Archive classroom':'Restore classroom'}>{room.active?<Archive size={15}/>:<RotateCcw size={15}/>}</button>}</div>
    </div>
  </article>;
}

function MiniMap({room}){return <div className="classroom-mini-map"><div className="mini-board">FRONT</div>{room.desks.slice(0,60).map(desk=><i key={desk.id} style={{left:`${desk.x/room.canvasWidth*100}%`,top:`${desk.y/room.canvasHeight*100}%`,width:`${desk.width/room.canvasWidth*100}%`,height:`${desk.height/room.canvasHeight*100}%`}}/>)}{!room.desks.length&&<div className="mini-empty"><Plus size={16}/><span>Empty layout</span></div>}</div>}
function Metric({icon:Icon,value,label,tone}){return <div className={`classroom-metric ${tone}`}><span><Icon size={17}/></span><div><b>{value}</b><small>{label}</small></div></div>}

function CreateClassroomModal({staffOptions,canAssign,onClose,onCreated}){
  const [form,setForm]=useState({name:'',canvasWidth:1000,canvasHeight:600,staffMembershipIds:[]}),[saving,setSaving]=useState(false),[error,setError]=useState('');
  function selectSize(width,height){setForm(value=>({...value,canvasWidth:width,canvasHeight:height}))}
  function toggleStaff(id){setForm(value=>({...value,staffMembershipIds:value.staffMembershipIds.includes(id)?value.staffMembershipIds.filter(item=>item!==id):[...value.staffMembershipIds,id]}))}
  async function create(event){event.preventDefault();if(saving||form.name.trim().length<2)return;setSaving(true);setError('');try{const data=await mutate({action:'create',...form,name:form.name.trim()});onCreated(data.classroom)}catch(cause){setError(cause.message);setSaving(false)}}
  return <div className="modal-backdrop classroom-modal-backdrop" onMouseDown={onClose}><form className="classroom-modal" onSubmit={create} onMouseDown={event=>event.stopPropagation()}><header><div><span className="eyebrow">New space</span><h2>Create classroom</h2><p>Start with the room dimensions. Desks are placed in the next step.</p></div><button type="button" className="icon-btn" onClick={onClose}><X size={18}/></button></header><div className="classroom-modal-body">
    {error&&<div className="classroom-form-error">{error}</div>}
    <label className="classroom-field"><span>Classroom name</span><input autoFocus value={form.name} onChange={event=>setForm(value=>({...value,name:event.target.value}))} placeholder="e.g. Programming Lab 204" maxLength={120}/><small>The private classroom address is generated automatically.</small></label>
    <div className="classroom-field"><span>Room size</span><div className="classroom-size-options">{sizes.map(([name,dimensions,width,height])=><button type="button" key={name} className={form.canvasWidth===width&&form.canvasHeight===height?'selected':''} onClick={()=>selectSize(width,height)}><span className="size-preview" style={{aspectRatio:`${width}/${height}`}}/><b>{name}</b><small>{dimensions}</small>{form.canvasWidth===width&&form.canvasHeight===height&&<Check size={14}/>}</button>)}</div></div>
    <div className="classroom-dimensions"><label className="classroom-field"><span>Width</span><input type="number" min="400" max="3000" value={form.canvasWidth} onChange={event=>setForm(value=>({...value,canvasWidth:Number(event.target.value)}))}/></label><label className="classroom-field"><span>Height</span><input type="number" min="300" max="2000" value={form.canvasHeight} onChange={event=>setForm(value=>({...value,canvasHeight:Number(event.target.value)}))}/></label></div>
    {canAssign&&<div className="classroom-field"><span>Teachers with access</span><div className="classroom-teacher-picker">{staffOptions.map(person=><button type="button" key={person.membershipId} className={form.staffMembershipIds.includes(person.membershipId)?'selected':''} onClick={()=>toggleStaff(person.membershipId)}><span>{person.firstName?.[0]}{person.lastName?.[0]}</span><div><b>{person.firstName} {person.lastName}</b><small>{person.email}</small></div><i>{form.staffMembershipIds.includes(person.membershipId)&&<Check size={12}/>}</i></button>)}{!staffOptions.length&&<p>No teacher accounts are available yet.</p>}</div><small>School admins always keep access.</small></div>}
  </div><footer><button type="button" className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={saving||form.name.trim().length<2}>{saving?'Creating…':'Create & open editor'}<ArrowRight size={14}/></button></footer></form></div>;
}
