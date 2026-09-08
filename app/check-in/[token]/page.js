import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import DeskCheckIn from '@/components/DeskCheckIn';
import { currentUser } from '@/lib/auth';
import { getDeskByQrToken } from '@/services/classrooms';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DeskCheckInPage({params}){
  const {token}=await params;let desk=null;
  if(UUID.test(token))try{desk=await getDeskByQrToken(token)}catch{}
  if(!desk||!desk.classroomActive)return <main className="desk-checkin-page"><section className="desk-checkin-card invalid"><span className="desk-checkin-icon"><ShieldCheck size={28}/></span><p className="eyebrow">DevTrack desk check-in</p><h1>This desk code is unavailable</h1><p>Ask your teacher to check the printed label or classroom status.</p><Link href="/login" className="btn secondary">Open DevTrack</Link></section></main>;
  return <DeskCheckIn desk={desk} token={token} user={await currentUser()}/>;
}
