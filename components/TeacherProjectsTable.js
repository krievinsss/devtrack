'use client';
import Link from 'next/link';
import { useMemo,useState } from 'react';
import { Search,SlidersHorizontal,UsersRound,GitBranch,CalendarDays,ArrowUpRight } from 'lucide-react';

export default function TeacherProjectsTable({assignments=[],groups=[],projects=[]}){
  const [groupId,setGroupId]=useState('all');
  const [status,setStatus]=useState('all');
  const [query,setQuery]=useState('');
  const groupMap=useMemo(()=>Object.fromEntries(groups.map(g=>[g.id,g])),[groups]);
  const rows=useMemo(()=>assignments.map(a=>{
    const studentProjects=projects.filter(p=>p.assignmentId===a.id);
    const connected=studentProjects.filter(p=>p.githubRepo).length;
    const active=a.active!==false&&a.status!=='inactive';
    return {a,group:groupMap[a.groupId],students:studentProjects.length,connected,active};
  }).filter(r=>{
    if(groupId!=='all'&&r.a.groupId!==groupId)return false;
    if(status==='active'&&!r.active)return false;
    if(status==='inactive'&&r.active)return false;
    const q=query.trim().toLowerCase();
    if(q&&!`${r.a.title} ${r.group?.name||''}`.toLowerCase().includes(q))return false;
    return true;
  }),[assignments,projects,groupMap,groupId,status,query]);
  const totalStudents=rows.reduce((s,r)=>s+r.students,0),totalConnected=rows.reduce((s,r)=>s+r.connected,0);
  return <div className="teacher-projects">
    <div className="teacher-projects-stats"><div><b>{rows.length}</b><span>Projects</span></div><div><b>{totalStudents}</b><span>Student workspaces</span></div><div><b>{totalConnected}</b><span>GitHub connected</span></div></div>
    <div className="teacher-projects-toolbar"><div className="teacher-projects-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search projects or groups…"/></div><div className="teacher-projects-filter"><SlidersHorizontal size={14}/><select value={groupId} onChange={e=>setGroupId(e.target.value)}><option value="all">All groups</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></div><div className="teacher-projects-filter"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div></div>
    <section className="panel teacher-projects-table"><div className="teacher-projects-head"><span>Project</span><span>Group</span><span>Students</span><span>GitHub</span><span>Deadline</span><span>Status</span><span></span></div>{rows.map(({a,group,students,connected,active})=><Link href={`/assignments/${a.id}`} className="teacher-projects-row" key={a.id}><div className="teacher-projects-main"><b>{a.title}</b><small>{(a.technologies||[]).slice(0,3).join(' · ')||'Project assignment'}</small></div><div><span className="teacher-projects-mobile">Group</span><b className="teacher-projects-group">{group?.name||'—'}</b></div><div className="teacher-projects-metric"><UsersRound size={14}/><span>{students}</span></div><div className="teacher-projects-metric"><GitBranch size={14}/><span>{connected}/{students}</span></div><div className="teacher-projects-metric muted"><CalendarDays size={14}/><span>{a.deadline||'—'}</span></div><div><span className={`teacher-projects-status ${active?'active':'inactive'}`}>{active?'Active':'Inactive'}</span></div><div className="teacher-projects-open"><ArrowUpRight size={16}/></div></Link>)}{!rows.length&&<div className="teacher-projects-empty">No projects match the selected filters.</div>}</section>
  </div>;
}
