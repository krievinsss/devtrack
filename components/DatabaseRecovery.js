'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle,CheckCircle2,DatabaseBackup,FolderGit2,History,Loader2,RotateCcw,Search,Users } from 'lucide-react';
import { Badge } from './UI';

const evidenceLabels={assignments:'Projects',projects:'Student workspaces',progressedProjects:'With progress',commits:'Commits',feedback:'Feedback',finalGrades:'Final grades',formativeGrades:'Formative grades',summativeGrades:'Summative grades',aiReviews:'AI logs'};

export default function DatabaseRecovery({configured}){
  const router=useRouter();
  const [audit,setAudit]=useState(null),[names,setNames]=useState({}),[busy,setBusy]=useState(false),[restoring,setRestoring]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');

  async function runAudit({keepMessage=false}={}){
    setBusy(true);setError('');if(!keepMessage)setMessage('');
    try{
      const response=await fetch('/api/admin/database/recovery',{cache:'no-store'}),data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Recovery audit failed');
      setAudit(data.audit);
      setNames(current=>Object.fromEntries(data.audit.candidates.map(candidate=>[candidate.groupId,current[candidate.groupId]??candidate.suggestedName??''])));
      return data.audit;
    }catch(error){setError(error.message||'Recovery audit failed');return null}finally{setBusy(false)}
  }

  async function restore(candidate){
    const name=(names[candidate.groupId]||'').trim();if(!name)return setError('Enter the original group name before restoring it.');
    const detail=`Restore “${name}” with ${candidate.students.length} student account${candidate.students.length===1?'':'s'} and ${candidate.projects.length} preserved workspace${candidate.projects.length===1?'':'s'}? Existing project data will not be overwritten.`;
    if(!confirm(detail))return;
    setRestoring(candidate.groupId);setError('');setMessage('');
    try{
      const response=await fetch('/api/admin/database/recovery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'restoreGroup',groupId:candidate.groupId,name,confirmation:'RESTORE_ORPHANED_GROUP'})}),data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Could not restore the group');
      setMessage(`${data.restored.group.name} restored with ${data.restored.group.studentIds.length} students. The preserved projects, commits and grades are linked again.`);
      await runAudit({keepMessage:true});router.refresh();
    }catch(error){setError(error.message||'Could not restore the group')}finally{setRestoring('')}
  }

  const candidates=audit?.candidates||[],unresolved=audit?.orphanedProjects||[];
  return <section className="panel recovery-panel">
    <div className="recovery-head"><div className="recovery-title"><span className="recovery-icon"><DatabaseBackup size={20}/></span><div><span className="eyebrow">DATA SAFETY</span><h2>Migration recovery</h2><p>Find groups that disappeared from the Neon directory while their projects and progress stayed intact.</p></div></div><button className="btn secondary" onClick={()=>runAudit()} disabled={busy||restoring||!configured}>{busy?<Loader2 className="spin" size={15}/>:<Search size={15}/>} {audit?'Run audit again':'Audit preserved data'}</button></div>
    {error&&<div className="recovery-notice danger"><AlertTriangle size={16}/><span>{error}</span></div>}
    {message&&<div className="recovery-notice success"><CheckCircle2 size={16}/><span>{message}</span></div>}
    {!audit&&!error&&<div className="recovery-empty"><History size={21}/><div><b>Nothing changes during an audit</b><span>DevTrack compares the live groups with assignments, student workspaces, commits, feedback and grades stored before the migration.</span></div></div>}
    {audit&&<>
      <div className="recovery-summary"><span><b>{audit.healthyGroups}</b> live groups</span><span><b>{audit.assignments}</b> projects scanned</span><span><b>{audit.projects}</b> workspaces scanned</span><Badge tone={candidates.length?'amber':'green'}>{candidates.length?`${candidates.length} missing group${candidates.length===1?'':'s'}`:'Directory is consistent'}</Badge></div>
      {!candidates.length&&!unresolved.length&&<div className="recovery-clear"><CheckCircle2 size={24}/><div><b>No disconnected data found</b><span>Every project points to a group that exists in Neon.</span></div></div>}
      <div className="recovery-candidates">{candidates.map(candidate=><article className="recovery-candidate" key={candidate.groupId}>
        <div className="recovery-candidate-head"><div><span className="eyebrow">{candidate.confidence.toUpperCase()} CONFIDENCE</span><h3>{candidate.assignments.map(item=>item.title).join(', ')}</h3><code>{candidate.groupId}</code></div><Badge tone={candidate.explicitlyDeleted?'red':candidate.recoveryReady?'amber':'blue'}>{candidate.explicitlyDeleted?'Explicitly deleted':candidate.recoveryReady?'Ready to restore':'Manual review'}</Badge></div>
        <div className="recovery-evidence">{Object.entries(candidate.evidence).filter(([,value])=>value>0).map(([key,value])=><span key={key}><b>{value}</b>{evidenceLabels[key]||key}</span>)}</div>
        <div className="recovery-details"><div><div className="recovery-detail-title"><Users size={15}/><b>Student accounts</b></div><div className="recovery-students">{candidate.students.slice(0,10).map(student=><span key={student.id}>{student.firstName} {student.lastName}<small>{student.email}</small></span>)}{candidate.students.length>10&&<em>+{candidate.students.length-10} more</em>}</div></div><div><div className="recovery-detail-title"><FolderGit2 size={15}/><b>Preserved workspaces</b></div><div className="recovery-projects">{candidate.projects.slice(0,8).map(project=><span key={project.id}><b>{project.studentName}</b><small>{project.status}{project.progress!=null?` · ${project.progress}%`:''}{project.repository?` · ${project.repository}`:''}</small></span>)}{candidate.projects.length>8&&<em>+{candidate.projects.length-8} more</em>}</div></div></div>
        {candidate.missingStudentIds.length>0&&<div className="recovery-inline-warning"><AlertTriangle size={14}/> {candidate.missingStudentIds.length} project workspace(s) reference an account that is also missing.</div>}
        {candidate.explicitlyDeleted?<div className="recovery-inline-warning"><AlertTriangle size={14}/> Neon records that this group was deliberately deleted. Automatic recovery is disabled to avoid reversing an intentional action.</div>:<div className="recovery-action"><label><span>Original group name</span><input value={names[candidate.groupId]||''} onChange={event=>setNames({...names,[candidate.groupId]:event.target.value})} placeholder="For example, IPa24" maxLength={100}/></label><button className="btn primary" onClick={()=>restore(candidate)} disabled={!candidate.recoveryReady||restoring===candidate.groupId||!(names[candidate.groupId]||'').trim()}>{restoring===candidate.groupId?<Loader2 className="spin" size={15}/>:<RotateCcw size={15}/>} Restore group & links</button></div>}
      </article>)}</div>
      {unresolved.length>0&&<div className="recovery-unresolved"><AlertTriangle size={17}/><div><b>{unresolved.length} workspace{unresolved.length===1?'':'s'} also lost the project definition</b><span>These cannot be linked automatically because the original group id is no longer present in the saved assignment. No data was changed.</span></div></div>}
    </>}
  </section>;
}
