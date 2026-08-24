'use client';
export function Bars({data}){const max=Math.max(1,...data.map(x=>x.value));return <div className="bars">{data.map((x,i)=><div className="bar-col" key={i}><div className="bar-track"><span style={{height:`${Math.max(5,x.value/max*100)}%`}} title={`${x.value} commits`}/></div><small>{x.label}</small></div>)}</div>}
export function Heatmap({days}){return <div className="heatmap">{days.map(d=><span key={d.date} className={`heat l${Math.min(4,d.count)}`} title={`${d.date}: ${d.count} commits`}/>)}</div>}
