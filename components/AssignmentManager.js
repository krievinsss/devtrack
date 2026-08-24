'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import RichTextEditor from './RichTextEditor';
import { richTextToPlain } from '@/lib/richText';

export default function AssignmentManager({groups}){
  const router=useRouter();
  const initialHtml='<h2>Projekta mērķis</h2><p>Apraksti, kas studentam jāizstrādā un kāds ir sagaidāmais rezultāts.</p>';
  const [title,setTitle]=useState(''),[groupId,setGroupId]=useState(groups[0]?.id||''),[descriptionHtml,setDescriptionHtml]=useState(initialHtml),[requirements,setRequirements]=useState(''),[technologies,setTechnologies]=useState('JavaScript, API, CSS'),[startDate,setStartDate]=useState(new Date().toISOString().slice(0,10)),[deadline,setDeadline]=useState(''),[rubric,setRubric]=useState([{name:'Funkcionalitāte',max:5},{name:'Koda kvalitāte',max:5},{name:'Git workflow',max:3}]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const setCriterion=(i,key,value)=>setRubric(rubric.map((r,j)=>j===i?{...r,[key]:key==='max'?Number(value):value}:r));
  async function create(){
    setBusy(true);setMessage('');
    const body={title,groupId,description:richTextToPlain(descriptionHtml),descriptionHtml,requirements:requirements.split('\n').map(x=>x.trim()).filter(Boolean),technologies:technologies.split(',').map(x=>x.trim()).filter(Boolean),rubric,startDate,deadline};
    try{
      const r=await fetch('/api/assignments',{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify(body)});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Could not publish project');
      setMessage('Project published successfully. Student projects have been created.');
      setTitle('');setDescriptionHtml(initialHtml);setRequirements('');setDeadline('');
      router.refresh();
      await new Promise(resolve=>setTimeout(resolve,80));
      router.refresh();
    }catch(e){setMessage(e.message)}finally{setBusy(false)}
  }
  return <section className="panel"><div className="panel-title"><h3>New group project</h3><span>Publish once → project for every student</span></div><div className="form-row">{message&&<div className="notice">{message}</div>}<input placeholder="Project title, e.g. Weather App" value={title} onChange={e=>setTitle(e.target.value)}/><select value={groupId} onChange={e=>setGroupId(e.target.value)}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><div><label className="field-label">Assignment page</label><RichTextEditor value={descriptionHtml} onChange={setDescriptionHtml} placeholder="Create a clear, formatted project brief…"/></div><textarea placeholder={'Requirements — one per line\nWeather API\nError handling\nResponsive UI'} value={requirements} onChange={e=>setRequirements(e.target.value)}/><input placeholder="Technologies, comma separated" value={technologies} onChange={e=>setTechnologies(e.target.value)}/><div className="inline-row"><label>Start <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label><label>Deadline <input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label></div><h4>Final assessment criteria</h4>{rubric.map((r,i)=><div className="inline-row" key={i}><input value={r.name} onChange={e=>setCriterion(i,'name',e.target.value)}/><input type="number" min="1" value={r.max} onChange={e=>setCriterion(i,'max',e.target.value)}/><button className="btn secondary" disabled={busy} onClick={()=>setRubric(rubric.filter((_,j)=>j!==i))}>Remove</button></div>)}<button className="btn secondary" disabled={busy} onClick={()=>setRubric([...rubric,{name:'',max:1}])}>+ Criterion</button><button className="btn primary" disabled={busy||!title||!deadline||!groupId||!richTextToPlain(descriptionHtml)} onClick={create}>{busy?'Publishing…':'Publish to group'}</button></div></section>;
}
