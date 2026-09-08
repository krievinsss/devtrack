import Link from 'next/link';
import { Armchair,Clock3,ShieldCheck } from 'lucide-react';
import { getDeskByQrToken } from '@/services/classrooms';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DeskCheckInPage({params}){
  const {token}=await params;let desk=null;
  if(UUID.test(token))try{desk=await getDeskByQrToken(token)}catch{}
  if(!desk||!desk.classroomActive)return <main className="desk-checkin-page"><section className="desk-checkin-card invalid"><span className="desk-checkin-icon"><ShieldCheck size={28}/></span><p className="eyebrow">DevTrack desk check-in</p><h1>This desk code is unavailable</h1><p>Ask your teacher to check the printed label or classroom status.</p><Link href="/login" className="btn secondary">Open DevTrack</Link></section></main>;
  return <main className="desk-checkin-page"><section className="desk-checkin-card"><div className="desk-checkin-room"><span className="desk-checkin-icon"><Armchair size={28}/></span><div><p className="eyebrow">{desk.classroomName}</p><h1>{desk.deskLabel||desk.deskCode}</h1><span>{desk.deskCode}</span></div></div><div className="desk-checkin-wait"><Clock3 size={18}/><div><b>No lesson check-in is open yet</b><p>This permanent desk code is ready. When the teacher starts attendance, scanning it will let you register for the lesson.</p></div></div><Link href="/login" className="btn primary wide">Open DevTrack</Link><small className="desk-checkin-secure"><ShieldCheck size={13}/>A scan never marks attendance without an active lesson and signed-in student.</small></section></main>;
}
