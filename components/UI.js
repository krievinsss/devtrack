import { ArrowUpRight, Clock3 } from 'lucide-react';
export function PageHeader({eyebrow,title,description,actions}){return <div className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="header-actions">{actions}</div>}</div>}
export function StatCard({label,value,sub,icon:Icon,tone}){return <div className={`stat-card ${tone||''}`}><div className="stat-top"><span>{label}</span>{Icon&&<Icon size={18}/>}</div><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
export function Badge({children,tone='neutral'}){return <span className={`badge ${tone}`}>{children}</span>}
export function Progress({value}){return <div className="progress"><span style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div>}
export function Empty({title,body}){return <div className="empty"><ArrowUpRight size={24}/><b>{title}</b><span>{body}</span></div>}
export function RelativeTime({date}){if(!date)return <span>—</span>;const d=Math.max(0,Math.floor((Date.now()-new Date(date))/1000));let t=d<60?`${d}s`:d<3600?`${Math.floor(d/60)}m`:d<86400?`${Math.floor(d/3600)}h`:`${Math.floor(d/86400)}d`;return <span className="muted-inline"><Clock3 size={13}/>{t} ago</span>}
