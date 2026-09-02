'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight,ClipboardCheck,FolderGit2,Save,X } from 'lucide-react';
import { gradeFromPercent } from '@/lib/grading';

export default function TeacherGradebook({groups=[],students=[],assignments=[],projects=[],initialFormative=[],initialSummative=[],initialFinal=[]}){
  const [groupId,setGroupId]=useState(groups[0]?.id||'');
  const groupAssignments=assignments.filter(a=>a.groupId===groupId);
  const [assignmentId,setAssignmentId]=useState(groupAssignments[0]?.id||'');
  const [formative,setFormative]=useState(initialFormative),[summative,setSummative]=useState(initialSummative),[finals,setFinals]=useState(initialFinal);
  const [editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const assignment=assignments.find(a=>a.id===assignmentId)||groupAssignments[0]||null;
  const selectedAssignmentId=assignment?.id||'';
  const group=groups.find(g=>g.id===groupId)||null;
  const memberIds=new Set(group?.studentIds||[]);
  const rows=students.filter(s=>memberIds.has(s.id)).map(student=>({student,project:projects.find(p=>p.assignmentId===selectedAssignmentId&&p.studentId===student.id)||null}));
  const columns=[
    ...formative.filter(e=>e.assignmentId===selectedAssignmentId).map(event=>({kind:'formative',event,label:event.title,date:event.date})),
    ...summative.filter(e=>e.assignmentId===selectedAssignmentId).map(event=>({kind:'summative',event,label:event.title,date:event.date})),
    {kind:'final',event:null,label:'Final grade',date:assignment?.deadline||''}
  ];
  const allResults=rows.flatMap(row=>columns.map(col=>resultFor(col,row.student.id,row.project?.id,finals)).filter(Boolean));
  const average=allResults.length?(allResults.reduce((sum,r)=>sum+Number(r.grade||0),0)/allResults.length).toFixed(1):'—';
  const gradedStudents=rows.filter(row=>columns.some(col=>resultFor(col,row.student.id,row.project?.id,finals))).length;

  function chooseGroup(id){setGroupId(id);const next=assignments.find(a=>a.groupId===id);setAssignmentId(next?.id||'');setEditor(null)}
  function openCell(column,row){if(!row.project)return;const current=resultFor(column,row.student.id,row.project.id,finals);const criteria=column.kind==='final'?(current?.criteria?.length?current.criteria:assignment?.rubric||[]):column.event?.criteria||[];setEditor({kind:column.kind,event:column.event,student:row.student,project:row.project,current,scores:criteria.map(c=>({name:c.name,max:Number(c.max||0),score:Number(current?.scores?.find(x=>x.name===c.name)?.score??c.score??0)})),feedback:current?.feedback||'',positive:current?.positive||'',improvement:current?.improvement||''});setError('')}
  async function save(){if(!editor||busy)return;setBusy(true);setError('');try{let url='/api/assessments',payload={id:editor.current?.id,projectId:editor.project.id,studentId:editor.student.id,criteria:editor.scores};if(editor.kind!=='final'){url=editor.kind==='formative'?'/api/formative':'/api/summative';payload={action:'grade',eventId:editor.event.id,studentId:editor.student.id,scores:editor.scores,feedback:editor.feedback,...(editor.kind==='formative'?{positive:editor.positive,improvement:editor.improvement}:{})}}const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),cache:'no-store'}),d=await r.json();if(!r.ok)throw new Error(d.error||'Could not save grade');const saved=editor.kind==='final'?d.item:d.result;if(editor.kind==='final')setFinals(items=>[saved,...items.filter(x=>!(x.projectId===editor.project.id&&x.studentId===editor.student.id))]);else{const setter=editor.kind==='formative'?setFormative:setSummative;setter(events=>events.map(event=>event.id===editor.event.id?{...event,results:[saved,...(event.results||[]).filter(x=>x.studentId!==editor.student.id)]}:event))}setEditor(null);window.dispatchEvent(new Event('devtrack-data-refresh'))}catch(e){setError(e.message)}finally{setBusy(false)}}

  return <div className="gradebook"><section className="panel gradebook-controls"><label><span>Group</span><select value={groupId} onChange={e=>chooseGroup(e.target.value)}>{groups.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label><label><span>Project</span><select value={selectedAssignmentId} onChange={e=>{setAssignmentId(e.target.value);setEditor(null)}}><option value="">Choose project…</option>{groupAssignments.map(a=><option value={a.id} key={a.id}>{a.title}</option>)}</select></label>{assignment&&<Link href={`/assignments/${assignment.id}`} className="btn secondary"><FolderGit2 size={15}/> Open project</Link>}</section>
    {!assignment?<section className="panel gradebook-empty"><ClipboardCheck size={28}/><h2>No project selected</h2><p>Create a project for this group first.</p></section>:<>
      <div className="gradebook-stats"><div><b>{rows.length}</b><span>Students</span></div><div><b>{columns.length}</b><span>Grade columns</span></div><div><b>{gradedStudents}/{rows.length}</b><span>Students graded</span></div><div><b>{average}</b><span>Average grade</span></div></div>
      {error&&<div className="notice danger">{error}</div>}
      <section className="panel gradebook-sheet"><div className="gradebook-scroll"><table><thead><tr><th>Student</th>{columns.map((column,i)=><th key={`${column.kind}-${column.event?.id||i}`}><span>{column.kind}</span><b>{column.label}</b><small>{column.date||'—'}</small></th>)}<th>Project</th></tr></thead><tbody>{rows.map(row=><tr key={row.student.id}><td><div className="gradebook-student"><span>{row.student.firstName?.[0]}{row.student.lastName?.[0]}</span><div><b>{row.student.firstName} {row.student.lastName}</b><small>{row.student.email}</small></div></div></td>{columns.map((column,i)=>{const result=resultFor(column,row.student.id,row.project?.id,finals);return <td key={`${column.kind}-${column.event?.id||i}`}><button className={`gradebook-cell ${result?'graded':'empty'}`} disabled={!row.project} onClick={()=>openCell(column,row)}>{result?<><strong>{result.grade}</strong><span>{result.percent??0}%</span></>:<><strong>+</strong><span>Add</span></>}</button></td>})}<td>{row.project?<Link className="gradebook-project-link" href={`/projects/${row.project.id}`}>Review <ChevronRight size={14}/></Link>:<span className="muted">Not created</span>}</td></tr>)}</tbody></table></div></section>
    </>}
    {editor&&<GradeEditor editor={editor} setEditor={setEditor} busy={busy} save={save}/>} 
  </div>;
}

function GradeEditor({editor,setEditor,busy,save}){
  const total=editor.scores.reduce((sum,x)=>sum+Number(x.score||0),0),max=editor.scores.reduce((sum,x)=>sum+Number(x.max||0),0),percent=max?Math.round(total/max*100):0,grade=gradeFromPercent(percent);
  function patchScore(index,value){setEditor(current=>({...current,scores:current.scores.map((item,i)=>i===index?{...item,score:Math.max(0,Math.min(Number(item.max),Number(value)||0))}:item)}))}
  return <div className="grade-editor-backdrop" onMouseDown={()=>!busy&&setEditor(null)}><div className="grade-editor" onMouseDown={e=>e.stopPropagation()}><header><div><span className="eyebrow">QUICK EDIT</span><h2>{editor.student.firstName} {editor.student.lastName}</h2><p>{editor.kind==='final'?'Final grade':editor.event?.title}</p></div><button className="icon-btn" onClick={()=>setEditor(null)} disabled={busy}><X size={18}/></button></header><div className="grade-editor-summary"><div><span>Points</span><b>{total}/{max}</b></div><div><span>Percent</span><b>{percent}%</b></div><div><span>Grade</span><b>{grade}</b></div></div><div className="grade-editor-body">{editor.scores.map((criterion,index)=><label className="grade-editor-criterion" key={`${criterion.name}-${index}`}><div><b>{criterion.name}</b><span>Maximum {criterion.max} points</span></div><div><input type="number" min="0" max={criterion.max} value={criterion.score} onChange={e=>patchScore(index,e.target.value)}/><span>/ {criterion.max}</span></div></label>)}{editor.kind==='formative'&&<><label className="grade-editor-note"><span>What went well</span><textarea value={editor.positive} onChange={e=>setEditor({...editor,positive:e.target.value})}/></label><label className="grade-editor-note"><span>Needs improvement</span><textarea value={editor.improvement} onChange={e=>setEditor({...editor,improvement:e.target.value})}/></label></>}{editor.kind!=='final'&&<label className="grade-editor-note"><span>Feedback</span><textarea value={editor.feedback} onChange={e=>setEditor({...editor,feedback:e.target.value})}/></label>}</div><footer><button className="btn secondary" disabled={busy} onClick={()=>setEditor(null)}>Cancel</button><button className="btn primary" disabled={busy||!editor.scores.length} onClick={save}>{busy?<><span className="save-spinner"/> Saving…</>:<><Save size={15}/> Save grade</>}</button></footer></div></div>;
}

function resultFor(column,studentId,projectId,finals){if(column.kind==='final')return finals.find(x=>x.studentId===studentId&&x.projectId===projectId)||null;return column.event?.results?.find(x=>x.studentId===studentId)||null}
