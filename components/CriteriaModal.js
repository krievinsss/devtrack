'use client';
import { useEffect } from 'react';
import { X, Target, Image as ImageIcon } from 'lucide-react';

const LEVEL_NAMES={5:'Advanced',4:'Proficient',3:'Developing',2:'Emerging',1:'Beginning',0:'Not demonstrated'};

export default function CriteriaModal({open,onClose,rubric=[]}){
  useEffect(()=>{if(!open)return;const fn=e=>e.key==='Escape'&&onClose();window.addEventListener('keydown',fn);return()=>window.removeEventListener('keydown',fn)},[open,onClose]);
  if(!open)return null;
  const total=rubric.reduce((s,c)=>s+Number(c.max||0),0);
  const points=[...new Set(rubric.flatMap(c=>(c.levels||[]).map(l=>Number(l.points))))].filter(Number.isFinite).sort((a,b)=>b-a);
  const hasMatrix=points.length>0;
  return <div className="ux-modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div className={`ux-modal rubric-modal ${hasMatrix?'rubric-matrix-modal':''}`}>
      <header className="ux-modal-head"><div><span className="eyebrow">ASSESSMENT</span><h2>Vērtēšanas rubrika</h2><p>Redzi ne tikai punktus, bet arī to, ko nozīmē katrs sasniegumu līmenis.</p></div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18}/></button></header>
      <div className="rubric-total"><Target size={18}/><span>Kopējais maksimālais vērtējums</span><b>{total} punkti</b></div>
      {hasMatrix?<div className="rubric-matrix-wrap"><table className="rubric-matrix"><thead><tr><th className="rubric-criterion-head">Kritērijs</th>{points.map(p=><th key={p}><b>{p} p.</b><span>{LEVEL_NAMES[p]||'Level'}</span></th>)}</tr></thead><tbody>{rubric.map((c,i)=><tr key={`${c.name}-${i}`}><td className="rubric-criterion-cell"><div className="rubric-criterion-title"><span>{i+1}</span><div><b>{c.name}</b>{c.description&&<small>{c.description}</small>}{c.imageUrl&&<a href={c.imageUrl} target="_blank" rel="noreferrer"><ImageIcon size={12}/> Skatīt piemēru</a>}</div></div></td>{points.map(p=>{const level=(c.levels||[]).find(l=>Number(l.points)===p);return <td key={p} className={level?'rubric-level-cell':'rubric-level-cell empty'}>{level?<><b>{level.label||`${p} punkti`}</b>{level.description&&<p>{level.description}</p>}</>:<span>—</span>}</td>})}</tr>)}</tbody></table></div>:<div className="rubric-list">{rubric.map((c,i)=><article className="rubric-card" key={`${c.name}-${i}`}><div className="rubric-number">{i+1}</div><div className="rubric-copy"><div className="rubric-title"><h3>{c.name}</h3><strong>{c.max} p.</strong></div>{c.description&&<p>{c.description}</p>}{c.imageUrl&&<div className="rubric-image-wrap"><div className="rubric-image-label"><ImageIcon size={13}/> Piemērs</div><img src={c.imageUrl} alt={`${c.name} example`} loading="lazy"/></div>}</div></article>)}</div>}
    </div>
  </div>;
}
