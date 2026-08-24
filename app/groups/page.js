import AppShell from '@/components/AppShell';
import GroupManager from '@/components/GroupManager';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getUsers } from '@/services/users';
import { defaultStudentPassword } from '@/lib/password';

export default async function Groups(){
  const user=await requirePageUser(['teacher','admin']);
  const [groups,users]=await Promise.all([readJson('groups',[]),getUsers()]);
  const students=users.filter(u=>u.role==='student');
  return <AppShell user={user}><PageHeader eyebrow="Cohorts & accounts" title="Groups" description="Create groups, add or edit students, import a whole class from CSV and manage first-login passwords."/><GroupManager initialGroups={groups} users={students} defaultPassword={defaultStudentPassword()}/></AppShell>;
}
