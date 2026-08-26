import AppShell from '@/components/AppShell';
import AssessmentProjectManager from '@/components/AssessmentProjectManager';
import { PageHeader,Badge,Progress } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getProjects } from '@/services/projects';
import { getUsers } from '@/services/users';
import { getAssignments } from '@/services/assignments';

export default async function Assessments(){
  const user=await requirePageUser();

  if(user.role!=='student'){
    const [groups,assignments]=await Promise.all([readJson('groups',[]),getAssignments()]);
    return <AppShell user={user}>
      <PageHeader eyebrow="Evaluation workspace" title="Assessments & projects" description="Prepare projects, control student visibility and edit assessment rubrics from one place."/>
      <AssessmentProjectManager initialAssignments={assignments} groups={groups}/>
    </AppShell>;
  }

  const projects=(await getProjects()).filter(p=>p.studentId===user.id);
  const ids=new Set(projects.map(p=>p.id));
  const [assessments,users]=await Promise.all([readJson('assessments',[]),getUsers()]);
  const rows=assessments.filter(a=>ids.has(a.projectId));
  return <AppShell user={user}>
    <PageHeader eyebrow="Evaluation" title="Assessments" description="Your scored project assessments and teacher evaluation."/>
    <div className="project-grid">{rows.map(a=>{const p=projects.find(x=>x.id===a.projectId),s=users.find(x=>x.id===a.studentId);return <section className="panel" key={a.id}><div className="panel-title"><div><h3>{p?.name}</h3><small>{s?.firstName} {s?.lastName}</small></div><Badge tone="green">Grade {a.grade}</Badge></div><div className="assessment-total compact"><div><span>Points</span><b>{a.total}/{a.maxTotal}</b></div><div><span>Result</span><b>{a.percent}%</b></div></div><Progress value={a.percent}/></section>})}</div>
  </AppShell>;
}
