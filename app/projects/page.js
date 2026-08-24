import Link from 'next/link';
import AppShell from '@/components/AppShell';
import { PageHeader,Badge,Progress } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getProjects } from '@/services/projects';
import { getUsers } from '@/services/users';
import { getAssignments } from '@/services/assignments';
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

  const projects=allProjects.filter(p=>p.studentId===user.id);
  return <AppShell user={user}>
    <PageHeader eyebrow="Repository workspace" title="My projects" description="Your assigned work, repository, diary, progress and teacher assessment."/>
    <div className="project-grid">{projects.map(p=>{const a=assignments.find(x=>x.id===p.assignmentId);return <Link href={`/projects/${p.id}`} className="panel project-list-card" key={p.id}><div className="panel-title"><div><Badge tone="purple">{p.status}</Badge><h3>{p.name}</h3></div><span>{p.progress}%</span></div><p>{a?.description||p.assignment||'Project workspace'}</p><Progress value={p.progress}/><div className="project-meta"><span>{p.githubRepo?`${p.githubOwner}/${p.githubRepo}`:'Repository not connected'}</span><span>Deadline {p.deadline||'—'}</span></div></Link>})}</div>
  </AppShell>;
}
