import Link from 'next/link';
import AppShell from '@/components/AppShell';
import StudentProjectsList from '@/components/StudentProjectsList';
import { PageHeader,Badge } from '@/components/UI';
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
      <PageHeader eyebrow="Teaching workspace" title="Group projects" description="Open an assignment first, then choose the individual student project you want to review."/>
      <div className="project-grid">{assignments.map(a=>{
        const group=groups.find(g=>g.id===a.groupId);
        const projects=allProjects.filter(p=>p.assignmentId===a.id);
        const connected=projects.filter(p=>p.githubRepo).length;
        return <Link href={`/assignments/${a.id}`} className="panel project-list-card" key={a.id}>
          <div className="panel-title"><div><Badge tone="purple">{group?.name||'Group'}</Badge><h3>{a.title}</h3></div><span>{projects.length} students</span></div>
          <p>{a.description}</p>
          <div className="project-meta"><span>{connected}/{projects.length} repositories connected</span><span>Deadline {a.deadline||'—'}</span></div>
        </Link>;
      })}</div>
    </AppShell>;
  }

  const active=new Map(assignments.filter(assignmentIsActive).map(a=>[a.id,a]));
  const initialItems=allProjects.filter(p=>p.studentId===user.id&&active.has(p.assignmentId)).map(project=>({project,assignment:active.get(project.assignmentId)}));
  return <AppShell user={user}>
    <PageHeader eyebrow="Repository workspace" title="My projects" description="Your active assigned work, repository, diary and teacher assessment."/>
    <StudentProjectsList initialItems={initialItems}/>
  </AppShell>;
}
