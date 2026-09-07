import Link from 'next/link';
import AppShell from '@/components/AppShell';
import TeacherAccessManager from '@/components/TeacherAccessManager';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getStaffAccessSnapshot } from '@/services/staffAccess';

export default async function TeacherAccessPage(){
  const user=await requirePageUser(['admin'],'administration','administration.manage_access');
  let snapshot=null,error='';
  try{snapshot=await getStaffAccessSnapshot({schoolId:user.schoolId})}catch(cause){error=cause?.message||'Staff access is unavailable'}
  return <AppShell user={user}>
    <PageHeader eyebrow="Administration" title="Teachers & Access" description="Control who can see each group, module and action without changing the experience for every other teacher."/>
    {snapshot?<TeacherAccessManager initialSnapshot={snapshot} viewer={{id:user.id,platformRole:user.platformRole}}/>:<section className="panel access-setup-required"><h3>Neon setup required</h3><p>{error}</p><Link href="/settings" className="btn primary">Open database settings</Link></section>}
  </AppShell>;
}
