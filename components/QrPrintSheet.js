'use client';
import Link from 'next/link';
import Script from 'next/script';
import { useEffect,useRef,useState } from 'react';
import { ArrowLeft,Armchair,Printer,QrCode } from 'lucide-react';
import { naturalDeskCompare } from '@/lib/classroomLayout';

export default function QrPrintSheet({classroom}){
  const [ready,setReady]=useState(false),desks=[...classroom.desks].sort(naturalDeskCompare),pages=[];
  for(let index=0;index<desks.length;index+=30)pages.push(desks.slice(index,index+30));
  return <main className="qr-print-screen"><Script src="/vendor/qrcode.min.js" strategy="afterInteractive" onLoad={()=>setReady(true)}/><header className="qr-screen-toolbar"><div><Link href={`/classrooms/${classroom.id}`}><ArrowLeft size={16}/>Back to layout</Link><span/><div><b>{classroom.name}</b><small>{desks.length} desk labels · {pages.length||0} page{pages.length===1?'':'s'}</small></div></div><button onClick={()=>window.print()} disabled={!desks.length}><Printer size={16}/>Print / Save PDF</button></header>
    {!desks.length?<section className="qr-empty"><span><QrCode size={28}/></span><h1>No QR labels yet</h1><p>Add and save at least one desk before printing.</p><Link className="btn primary" href={`/classrooms/${classroom.id}`}><Armchair size={15}/>Open layout editor</Link></section>:<div className="qr-pages">{pages.map((page,pageIndex)=><section className="qr-sheet" key={pageIndex}><header><div className="qr-sheet-brand">D</div><div><span>DEVTRACK · DESK CHECK-IN</span><h1>{classroom.name}</h1></div><small>Page {pageIndex+1} / {pages.length}</small></header><div className="qr-sheet-grid">{page.map(desk=><article className="qr-label" key={desk.id}><div className="qr-label-name"><b>{desk.label||desk.code}</b><span>{desk.code}</span></div><QrCanvas value={`/check-in/${desk.qrToken}`} ready={ready}/><p>Scan to check in</p></article>)}</div><footer>Permanent desk codes · Move or rename desks without reprinting</footer></section>)}</div>}
  </main>;
}

function QrCanvas({value,ready}){
  const ref=useRef(null);
  useEffect(()=>{if(!ready||!ref.current||!window.QRCode)return;ref.current.innerHTML='';new window.QRCode(ref.current,{text:`${window.location.origin}${value}`,width:256,height:256,colorDark:'#101828',colorLight:'#ffffff',correctLevel:window.QRCode.CorrectLevel.M})},[ready,value]);
  return <div className={`qr-code-box ${ready?'ready':''}`} ref={ref}>{!ready&&<QrCode size={28}/>}</div>;
}
