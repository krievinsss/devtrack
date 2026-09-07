import AppShell from '@/components/AppShell';
import GroupManager from '@/components/GroupManager';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getGroups } from '@/services/groups';
import { getUsers } from '@/services/users';
import { defaultStudentPassword } from '@/lib/password';

export default async function Groups(){
  const user=await requirePageUser(['teacher','admin'],'groups');
  const [allGroups,users]=await Promise.all([getGroups(),getUsers()]);
  const groups=user.role==='admin'?allGroups:allGroups.filter(group=>(group.teacherIds||[]).includes(user.id)),visibleStudentIds=new Set(groups.flatMap(group=>group.studentIds||[]));
  const students=users.filter(item=>item.role==='student'&&visibleStudentIds.has(item.id));
  return <AppShell user={user}><PageHeader eyebrow="People & cohorts" title="Students & Groups" description="Manage groups and every student account from one place."/><GroupManager initialGroups={groups} users={students} defaultPassword={defaultStudentPassword()} canManage={user.permissionKeys?.includes('groups.manage')}/></AppShell>;
}
