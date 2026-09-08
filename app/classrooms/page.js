import Link from 'next/link';
import AppShell from '@/components/AppShell';
import ClassroomHub from '@/components/ClassroomHub';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getClassrooms,getClassroomStaffOptions } from '@/services/classrooms';

export default async function ClassroomsPage(){
  const user=await requirePageUser(['teacher','admin'],'classrooms','classrooms.view');
  let classrooms=[],staff=[],error='';
  try{[classrooms,staff]=await Promise.all([getClassrooms(user),getClassroomStaffOptions(user)])}catch(cause){error=cause?.message||'Classrooms are unavailable.'}
  return <AppShell user={user}><PageHeader eyebrow="Deskplan · Phase 1" title="Classrooms & Desks" description="Build each room once, arrange desks visually and print permanent QR labels." actions={user.permissionKeys?.includes('classrooms.manage')&&!error?<span className="classroom-header-chip">Live editing · one save</span>:null}/>{error?<section className="panel classroom-setup"><h2>Classrooms need a database update</h2><p>{error}</p><Link className="btn primary" href="/settings">Open database settings</Link></section>:<ClassroomHub initialClassrooms={classrooms} staffOptions={staff} canManage={user.permissionKeys?.includes('classrooms.manage')} canAssign={user.role==='admin'||user.platformRole==='super_admin'}/>}</AppShell>;
}
