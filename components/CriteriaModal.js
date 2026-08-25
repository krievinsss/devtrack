'use client';
import { useEffect } from 'react';
import { X, Target, Image as ImageIcon } from 'lucide-react';

export default function CriteriaModal({open,onClose,rubric=[]}){
  useEffect(()=>{if(!open)return;const fn=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[open,onClose]);
  if(!open)return null;
  const total=rubric.reduce((s,c)=>s+Number(c.max||0),0);
  return <div className="ux-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className="ux-modal rubric-modal">
      <header className="ux-modal-head"><div><span className="eyebrow">ASSESSMENT</span><h2>Vērtēšanas kritēriji</h2><p>Šie ir kritēriji, pēc kuriem tiks vērtēts gala darbs.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></header>
      <div className="rubric-total"><Target size={18}/><span>Kopā</span><b>{total} punkti</b></div>
      <div className="rubric-list">{rubric.map((c,i)=><article className="rubric-card" key={`${c.name}-${i}`}><div className="rubric-number">{i+1}</div><div className="rubric-copy"><div className="rubric-title"><h3>{c.name}</h3><strong>{c.max} p.</strong></div>{c.description&&<p>{c.description}</p>}{c.imageUrl&&<div className="rubric-image-wrap"><div className="rubric-image-label"><ImageIcon size={13}/> Piemērs</div><img src={c.imageUrl} alt={`${c.name} example`} loading="lazy"/></div>}{Array.isArray(c.levels)&&c.levels.length>0&&<div className="rubric-levels">{c.levels.map((l,j)=><div key={j}><b>{l.points} p.</b><span>{l.label||l.description}</span></div>)}</div>}</div></article>)}</div>
    </div>
  </div>;
}
