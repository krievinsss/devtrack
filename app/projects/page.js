import AppShell from '@/components/AppShell';
import StudentProjectsList from '@/components/StudentProjectsList';
import TeacherProjectsTable from '@/components/TeacherProjectsTable';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getProjects } from '@/services/projects';
import { getUsers } from '@/services/users';
import { getAssignments,assignmentIsActive } from '@/services/assignments';
import { readJson } from '@/lib/storage';

export default async function Projects(){
  const user=await requirePageUser();
  const [users,assignments,groups,allProjects]=await Promise.all([getUsers(),getAssignments(),readJson('groups',[]),getProjects()]);

  if(user.role!=='student'){
    return <AppShell user={user}>
      <PageHeader eyebrow="Teaching workspace" title="Projects" description="Review every assignment, group and student repository from one overview."/>
      <TeacherProjectsTable assignments={assignments} groups={groups} projects={allProjects}/>
    </AppShell>;
  }

  const active=new Map(assignments.filter(assignmentIsActive).map(a=>[a.id,a]));
  const initialItems=allProjects.filter(p=>p.studentId===user.id&&active.has(p.assignmentId)).map(project=>({project,assignment:active.get(project.assignmentId)}));
  return <AppShell user={user}>
    <PageHeader eyebrow="Repository workspace" title="My projects" description="Your active assigned work, repository, diary and teacher assessment."/>
    <StudentProjectsList initialItems={initialItems}/>
  </AppShell>;
}
