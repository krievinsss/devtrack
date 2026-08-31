'use client';
import { useRef,useState } from 'react';
import { Upload,LoaderCircle } from 'lucide-react';

export default function RubricImportButton({onImported,label='Import rubric'}){
  const inputRef=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function pick(file){if(!file||busy)return;setBusy(true);setError('');try{const data=await toDataUrl(file);const r=await fetch('/api/rubric/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:file.name,type:file.type||guessType(file.name),data})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Could not import rubric');onImported?.(d.criteria||[])}catch(e){setError(e.message)}finally{setBusy(false);if(inputRef.current)inputRef.current.value=''}}
  return <div className="rubric-import-control"><input ref={inputRef} className="rubric-import-file" type="file" accept=".txt,text/plain,image/png,image/jpeg,image/webp" onChange={e=>pick(e.target.files?.[0])}/><button type="button" className="btn secondary compact" disabled={busy} onClick={()=>inputRef.current?.click()}>{busy?<LoaderCircle className="spin" size={14}/>:<Upload size={14}/>} {busy?'Reading rubric…':label}</button>{error&&<small className="rubric-import-error">{error}</small>}</div>
}
function toDataUrl(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Could not read file'));r.readAsDataURL(file)})}
function guessType(name){return name.toLowerCase().endsWith('.txt')?'text/plain':'application/octet-stream'}
