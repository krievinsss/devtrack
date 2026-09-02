'use client';
import Link from 'next/link';
import { Bell,CheckCheck,MessageSquareText,Award,ClipboardCheck,FolderGit2 } from 'lucide-react';
import { useCallback,useEffect,useRef,useState } from 'react';

export default function NotificationsBell({user}){
  const [items,setItems]=useState([]),[unread,setUnread]=useState(0),[open,setOpen]=useState(false);
  const root=useRef(null);
  const load=useCallback(async()=>{if(user?.role!=='student')return;try{const r=await fetch(`/api/notifications?t=${Date.now()}`,{cache:'no-store'}),d=await r.json();if(r.ok&&d.ok){setItems(d.notifications||[]);setUnread(Number(d.unread||0));}}catch{}},[user?.role]);
  useEffect(()=>{if(user?.role!=='student')return;const start=setTimeout(load,0),timer=setInterval(load,2500),refresh=()=>load(),click=e=>{if(root.current&&!root.current.contains(e.target))setOpen(false)};window.addEventListener('devtrack-data-refresh',refresh);document.addEventListener('mousedown',click);return()=>{clearTimeout(start);clearInterval(timer);window.removeEventListener('devtrack-data-refresh',refresh);document.removeEventListener('mousedown',click)}},[load,user?.role]);
  if(user?.role!=='student')return null;
  async function markRead(id){setItems(x=>x.map(n=>n.id===id?{...n,read:true}:n));setUnread(x=>Math.max(0,x-1));fetch('/api/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'read',notificationId:id})}).catch(()=>{});}
  async function markAll(){setItems(x=>x.map(n=>({...n,read:true})));setUnread(0);await fetch('/api/notifications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'read-all'})}).catch(()=>{});}
  return <div className="notifications-bell" ref={root}><button className={`icon-btn notification-trigger ${unread?'has-unread':''}`} onClick={()=>setOpen(v=>!v)} aria-label="Notifications"><Bell size={18}/>{unread>0&&<span>{unread>99?'99+':unread}</span>}</button>{open&&<div className="notifications-popover"><header><div><b>Notifications</b><small>{unread?`${unread} unread`:'All caught up'}</small></div>{unread>0&&<button onClick={markAll}><CheckCheck size={14}/> Mark all read</button>}</header><div className="notifications-list">{items.length?items.slice(0,12).map(n=><Link href={n.href||'/dashboard'} key={n.id} className={n.read?'read':'unread'} onClick={()=>markRead(n.id)}><div className="notification-icon">{n.type==='feedback'?<MessageSquareText size={15}/>:n.type==='grade'?<Award size={15}/>:<ClipboardCheck size={15}/>}</div><div>{n.projectTitle&&<span className="notification-project"><FolderGit2 size={12}/>{n.projectTitle}</span>}<b>{n.title}</b><p>{n.message}</p><small>{timeAgo(n.createdAt)}</small></div>{!n.read&&<i/>}</Link>):<div className="notifications-empty"><Bell size={22}/><b>Nav jaunu paziņojumu</b><span>Ja skolotājs pievienos feedback vai vērtējumu, tas parādīsies šeit.</span></div>}</div></div>}</div>;
}
function timeAgo(value){const ms=Date.now()-new Date(value).getTime(),m=Math.max(0,Math.floor(ms/60000));if(m<1)return'Tikko';if(m<60)return`${m} min`;const h=Math.floor(m/60);if(h<24)return`${h} h`;return`${Math.floor(h/24)} d`;}
