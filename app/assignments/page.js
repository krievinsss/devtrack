import AppShell from '@/components/AppShell';
import AssessmentProjectManager from '@/components/AssessmentProjectManager';
import { PageHeader } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getAssignments } from '@/services/assignments';

export default async function Assignments(){
  const user=await requirePageUser(['teacher','admin']);
  const [groups,assignments]=await Promise.all([readJson('groups',[]),getAssignments()]);
  return <AppShell user={user}>
    <PageHeader eyebrow="Teaching workflow" title="Assignments" description="Create, prepare, edit and publish group projects from one place."/>
    <AssessmentProjectManager initialAssignments={assignments} groups={groups}/>
  </AppShell>;
}
