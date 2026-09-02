'use client';
import Link from 'next/link';
import { useCallback,useEffect,useState } from 'react';
import { Badge } from './UI';
export default function StudentProjectsList({initialItems=[]}){
  const [items,setItems]=useState(initialItems);
  const sync=useCallback(async()=>{try{const r=await fetch(`/api/student-projects?t=${Date.now()}`,{cache:'no-store'});const d=await r.json();if(r.ok&&d.ok)setItems(d.items||[])}catch{}},[]);
  useEffect(()=>{const focus=()=>sync();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);window.addEventListener('devtrack-data-refresh',focus);return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('devtrack-data-refresh',focus)}},[sync]);
  if(!items.length)return <section className="panel"><p className="empty">No active projects right now.</p></section>;
  return <div className="project-grid">{items.map(({project:p,assignment:a})=><Link href={`/projects/${p.id}`} className="panel project-list-card" key={p.id}><div className="panel-title"><div><Badge tone="purple">{p.status}</Badge><h3>{p.name}</h3></div></div><p>{a?.description||p.assignment||'Project workspace'}</p><div className="project-meta"><span>{p.githubRepo?`${p.githubOwner}/${p.githubRepo}`:'Repository not connected'}</span><span>Deadline {p.deadline||'—'}</span></div></Link>)}</div>;
}
