import AppShell from '@/components/AppShell';
import TeacherGradebook from '@/components/TeacherGradebook';
import { PageHeader,Badge,Progress } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getProjects } from '@/services/projects';
import { getUsers } from '@/services/users';

export default async function Assessments(){
  const user=await requirePageUser();
  let projects=await getProjects();
  if(user.role==='student')projects=projects.filter(p=>p.studentId===user.id);
  const ids=new Set(projects.map(p=>p.id));
  const [assessments,users,groups,assignments,formative,summative]=await Promise.all([readJson('assessments',[]),getUsers(),readJson('groups',[]),readJson('assignments',[]),readJson('formativeAssessments',[]),readJson('summativeAssessments',[])]);
  const rows=assessments.filter(a=>ids.has(a.projectId));
  if(user.role!=='student')return <AppShell user={user}><PageHeader eyebrow="Evaluation" title="Grades" description="Choose a group and project, then review or edit every grade from one table."/><TeacherGradebook groups={groups} students={users.filter(x=>x.role==='student')} assignments={assignments} projects={projects} initialFormative={formative} initialSummative={summative} initialFinal={rows}/></AppShell>;
  return <AppShell user={user}>
    <PageHeader eyebrow="Evaluation" title="Assessments" description="Configurable criteria with transparent points and teacher-controlled final grading."/>
    <div className="project-grid">{rows.map(a=>{const p=projects.find(x=>x.id===a.projectId),s=users.find(x=>x.id===a.studentId);return <section className="panel" key={a.id}><div className="panel-title"><div><h3>{p?.name}</h3><small>{s?.firstName} {s?.lastName}</small></div><Badge tone="green">Grade {a.grade}</Badge></div><div className="assessment-total compact"><div><span>Points</span><b>{a.total}/{a.maxTotal}</b></div><div><span>Result</span><b>{a.percent}%</b></div></div><Progress value={a.percent}/></section>})}</div>
  </AppShell>;
}
