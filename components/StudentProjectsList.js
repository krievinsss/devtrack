'use client';

import Link from 'next/link';
import { useCallback,useEffect,useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileText,
  Github,
  GraduationCap,
  Presentation,
  Target,
} from 'lucide-react';
import styles from './StudentProjectsList.module.css';

function statusLabel(status){
  const value=String(status||'not started').trim().toLowerCase();
  if(value==='in progress')return 'In progress';
  if(value==='completed'||value==='done')return 'Completed';
  return 'Not started';
}

function statusHint(status){
  const value=String(status||'not started').trim().toLowerCase();
  if(value==='in progress')return 'Development is active';
  if(value==='completed'||value==='done')return 'Project completed';
  return 'Start your development';
}

export default function StudentProjectsList({initialItems=[]}){
  const [items,setItems]=useState(initialItems);
  const sync=useCallback(async()=>{try{const r=await fetch(`/api/student-projects?t=${Date.now()}`,{cache:'no-store'});const d=await r.json();if(r.ok&&d.ok)setItems(d.items||[])}catch{}},[]);
  useEffect(()=>{const focus=()=>sync();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);window.addEventListener('devtrack-data-refresh',focus);return()=>{window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('devtrack-data-refresh',focus)}},[sync]);

  if(!items.length)return <section className={styles.empty}>No active projects right now.</section>;

  return <div className={styles.grid}>{items.map(({project:p,assignment:a})=>{
    const href=`/projects/${p.id}`;
    const hasRepo=Boolean(p.githubRepo);
    const brief=a?.description||p.assignment||'Open the project workspace to review the full brief, milestones and assessment criteria.';

    return <article className={styles.card} key={p.id}>
      <div className={styles.cardMain}>
        <div className={styles.top}>
          <div className={styles.titleWrap}>
            <span className={styles.status}>{statusLabel(p.status)}</span>
            <h2 className={styles.title}>{p.name}</h2>
            <p className={styles.subtitle}><GraduationCap size={15}/> 4. kursa kvalifikācijas darbs — Programmēšanas tehniķis</p>
          </div>
          <Link href={href} className={styles.openButton}>Open project <ArrowRight size={15}/></Link>
        </div>

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <span className={styles.metaIcon}><CalendarDays size={18}/></span>
            <span>
              <span className={styles.metaLabel}>Deadline</span>
              <span className={styles.metaValue}>{p.deadline||'—'}</span>
              <span className={styles.metaHint}>Project schedule</span>
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaIcon}><Github size={18}/></span>
            <span>
              <span className={styles.metaLabel}>Repository</span>
              <span className={styles.metaValue}>{hasRepo?`${p.githubOwner}/${p.githubRepo}`:'Not connected'}</span>
              <span className={styles.metaHint}>{hasRepo?'GitHub repository connected':'Connect GitHub to start'}</span>
            </span>
          </div>
          <div className={styles.metaItem}>
            <span className={styles.metaIcon}><CircleDot size={18}/></span>
            <span>
              <span className={styles.metaLabel}>Status</span>
              <span className={styles.metaValue}>{statusLabel(p.status)}</span>
              <span className={styles.metaHint}>{statusHint(p.status)}</span>
            </span>
          </div>
        </div>

        <div className={styles.contentGrid}>
          <div>
            <div className={styles.sectionLabel}><FileText size={14}/> Project brief</div>
            <p className={styles.brief}>{brief}</p>
            <Link href={href} className={styles.readMore}>Read full brief <ArrowRight size={14}/></Link>
          </div>

          <aside className={styles.glance}>
            <div className={styles.sectionLabel}>At a glance</div>
            <div className={styles.glanceList}>
              <div className={styles.glanceItem}><CalendarDays size={15}/> 8 nedēļu izstrādes plāns ar checkpointiem</div>
              <div className={styles.glanceItem}><Github size={15}/> Obligāta GitHub izmantošana</div>
              <div className={styles.glanceItem}><CheckCircle2 size={15}/> Formatīvie vērtējumi katru nedēļu</div>
              <div className={styles.glanceItem}><Target size={15}/> Summatīvie vērtējumi galvenajos posmos</div>
              <div className={styles.glanceItem}><Presentation size={15}/> Live demo un aizstāvēšana</div>
            </div>
          </aside>
        </div>
      </div>

      {!hasRepo&&<div className={styles.nextStep}>
        <div className={styles.nextStepText}>
          <span className={styles.nextStepIcon}><Clock3 size={17}/></span>
          <span><strong>Next step</strong><span>Pieslēdz savu GitHub repozitoriju, lai sāktu reģistrēt izstrādes progresu.</span></span>
        </div>
        <Link href={href} className={styles.nextStepButton}>Connect GitHub</Link>
      </div>}
    </article>;
  })}</div>;
}
