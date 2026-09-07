import AppShell from '@/components/AppShell';
import TimetableView from '@/components/TimetableView';
import { requirePageUser } from '@/lib/page';
import { getGroups } from '@/services/groups';
import { timetableForUser } from '@/services/timetable';

export default async function TimetablePage({searchParams}){
  const user=await requirePageUser([],'timetable');
  const params=await searchParams;
  const groups=await getGroups();
  const timetable=await timetableForUser(user,groups,params?.week,{fresh:Boolean(params?.fresh)});
  return <AppShell user={user}><TimetableView timetable={timetable} role={user.role}/></AppShell>;
}
