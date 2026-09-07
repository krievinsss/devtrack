import AppShell from '@/components/AppShell';
import ClassroomMusic from '@/components/ClassroomMusic';
import { requirePageUser } from '@/lib/page';

export default async function MusicPage(){
  const user = await requirePageUser(['student','teacher','admin'],'music');
  return <AppShell user={user}><ClassroomMusic user={user}/></AppShell>;
}
