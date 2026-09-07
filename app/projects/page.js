import AppShell from '@/components/AppShell';
import AssessmentProjectManager from '@/components/AssessmentProjectManager';
import StudentProjectsList from '@/components/StudentProjectsList';
import TeacherProjectsTable from '@/components/TeacherProjectsTable';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { getProjects } from '@/services/projects';
import { getAssignments,assignmentIsActive } from '@/services/assignments';
import { getGroups } from '@/services/groups';

export default async function Projects(){
  const user=await requirePageUser([],'projects');
  const [allAssignments,allGroups,projects]=await Promise.all([getAssignments(),getGroups(),getProjects()]);

  if(user.role!=='student'){
    const visibleGroupIds=new Set(user.role==='admin'?allGroups.map(group=>group.id):user.groupIds||[]);
    const groups=allGroups.filter(group=>visibleGroupIds.has(group.id)),assignments=allAssignments.filter(assignment=>visibleGroupIds.has(assignment.groupId)),assignmentIds=new Set(assignments.map(assignment=>assignment.id)),allProjects=projects.filter(project=>assignmentIds.has(project.assignmentId));
    return <AppShell user={user}>
      <PageHeader eyebrow="Teaching workspace" title="Projects" description="Review every assignment, group and student repository from one overview."/>
      <AssessmentProjectManager initialAssignments={assignments} groups={groups} projects={allProjects}/>
      <div className="projects-overview-section">
        <div><span className="eyebrow">STUDENT WORKSPACES</span><h2>Project overview</h2><p>Open a project to review the group, repositories and individual student work.</p></div>
        <TeacherProjectsTable assignments={assignments} groups={groups} projects={allProjects}/>
      </div>
    </AppShell>;
  }

  const active=new Map(allAssignments.filter(assignmentIsActive).map(a=>[a.id,a]));
  const initialItems=projects.filter(p=>p.studentId===user.id&&active.has(p.assignmentId)).map(project=>({project,assignment:active.get(project.assignmentId)}));
  return <AppShell user={user}>
    <PageHeader eyebrow="Repository workspace" title="My projects" description="Your active assigned work, repository, diary and teacher assessment."/>
    <StudentProjectsList initialItems={initialItems}/>
  </AppShell>;
}
