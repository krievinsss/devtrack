import Link from 'next/link';
import AppShell from '@/components/AppShell';
import AttendanceBoard from '@/components/AttendanceBoard';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getAttendanceDashboard,getStudentAttendance } from '@/services/attendance';
import { getClassrooms } from '@/services/classrooms';
import { getCoreGroups } from '@/services/coreDirectory';

export default async function AttendancePage(){
  const user=await requirePageUser([],'attendance');let attendance=null,classrooms=[],groups=[],error='';
  try{
    if(user.role==='student')attendance=await getStudentAttendance(user);
    else [attendance,classrooms,groups]=await Promise.all([getAttendanceDashboard(user),getClassrooms(user,{includeInactive:false}),getCoreGroups()]);
  }catch(cause){error=cause?.message||'Attendance is unavailable.'}
  const allowedGroups=user.role==='admin'||user.platformRole==='super_admin'?groups:groups.filter(group=>(user.groupIds||[]).includes(group.id));
  return <AppShell user={user}><PageHeader eyebrow="Deskplan · Live attendance" title={user.role==='student'?'My attendance':'Lesson control'} description={user.role==='student'?'Your lesson check-ins, late arrivals and attendance history.':'Open a lesson, watch the room fill live and correct attendance without leaving the page.'} actions={user.role!=='student'&&!error?<span className="attendance-live-chip"><i/> Live desk check-in</span>:null}/>{error?<section className="panel attendance-setup"><h2>Attendance needs a database update</h2><p>{error}</p><Link href="/settings" className="btn primary">Open database settings</Link></section>:<AttendanceBoard initialAttendance={attendance} classrooms={classrooms} groups={allowedGroups} userRole={user.role} canManage={user.permissionKeys?.includes('attendance.manage_sessions')} canOverride={user.permissionKeys?.includes('attendance.override')}/>}</AppShell>;
}
