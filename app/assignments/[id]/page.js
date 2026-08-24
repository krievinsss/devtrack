import { notFound } from 'next/navigation';
import AppShell from '@/components/AppShell';
import AssignmentDetail from '@/components/AssignmentDetail';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getAssignment } from '@/services/assignments';
import { getUsers } from '@/services/users';
import { getProjects } from '@/services/projects';
import { getFormativeEvents } from '@/services/formative';
export default async function AssignmentPage({params}){const user=await requirePageUser(['teacher','admin']);const {id}=await params;const assignment=await getAssignment(id);if(!assignment)notFound();const [groups,users,projects,events]=await Promise.all([readJson('groups',[]),getUsers(),getProjects(),getFormativeEvents(id)]);const group=groups.find(g=>g.id===assignment.groupId);const students=(group?.studentIds||[]).map(x=>users.find(u=>u.id===x)).filter(Boolean);const linked=projects.filter(p=>p.assignmentId===id);return <AppShell user={user}><AssignmentDetail assignment={assignment} group={group} students={students} projects={linked} events={events}/></AppShell>}
