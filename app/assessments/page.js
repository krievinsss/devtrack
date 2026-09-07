import AppShell from '@/components/AppShell';
import TeacherGradebook from '@/components/TeacherGradebook';
import { PageHeader,Badge,Progress } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getProjects } from '@/services/projects';
import { getUsers } from '@/services/users';
import { getGroups } from '@/services/groups';

export default async function Assessments(){
  const user=await requirePageUser([],'grades');
  let [projects,users,groups,assignments,formative,summative]=await Promise.all([getProjects(),getUsers(),getGroups(),readJson('assignments',[]),readJson('formativeAssessments',[]),readJson('summativeAssessments',[])]);
  if(user.role==='student')projects=projects.filter(project=>project.studentId===user.id);
  if(user.role==='teacher'){
    const visibleGroupIds=new Set(user.groupIds||[]),visibleStudentIds=new Set(users.filter(student=>(student.groupIds||[]).some(groupId=>visibleGroupIds.has(groupId))).map(student=>student.id));
    groups=groups.filter(group=>visibleGroupIds.has(group.id));assignments=assignments.filter(assignment=>visibleGroupIds.has(assignment.groupId));
    const assignmentIds=new Set(assignments.map(assignment=>assignment.id));projects=projects.filter(project=>assignmentIds.has(project.assignmentId)&&visibleStudentIds.has(project.studentId));users=users.filter(item=>item.role!=='student'||visibleStudentIds.has(item.id));
    formative=formative.filter(event=>assignmentIds.has(event.assignmentId));summative=summative.filter(event=>assignmentIds.has(event.assignmentId));
  }
  const ids=new Set(projects.map(project=>project.id)),assessments=await readJson('assessments',[]);
  const rows=assessments.filter(a=>ids.has(a.projectId));
  if(user.role!=='student'){
    const [commits,aiReviews]=await Promise.all([readJson('commits',[]),readJson('aiReviews',[])]);
    const evidenceByProject=Object.fromEntries(projects.map(project=>[project.id,{
      commits:commits.filter(item=>item.repositoryId===project.id).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0,100),
      aiReviews:aiReviews.filter(item=>item.projectId===project.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,10)
    }]));
    return <AppShell user={user}><PageHeader eyebrow="Evaluation" title="Grades" description="Choose a group and project, then review or edit every grade from one table."/><TeacherGradebook groups={groups} students={users.filter(x=>x.role==='student')} assignments={assignments} projects={projects} initialFormative={formative} initialSummative={summative} initialFinal={rows} evidenceByProject={evidenceByProject}/></AppShell>;
  }
  return <AppShell user={user}>
    <PageHeader eyebrow="Evaluation" title="Assessments" description="Configurable criteria with transparent points and teacher-controlled final grading."/>
    <div className="project-grid">{rows.map(a=>{const p=projects.find(x=>x.id===a.projectId),s=users.find(x=>x.id===a.studentId);return <section className="panel" key={a.id}><div className="panel-title"><div><h3>{p?.name}</h3><small>{s?.firstName} {s?.lastName}</small></div><Badge tone="green">Grade {a.grade}</Badge></div><div className="assessment-total compact"><div><span>Points</span><b>{a.total}/{a.maxTotal}</b></div><div><span>Result</span><b>{a.percent}%</b></div></div><Progress value={a.percent}/></section>})}</div>
  </AppShell>;
}
