import Link from 'next/link';
import AppShell from '@/components/AppShell';
import AssignmentManager from '@/components/AssignmentManager';
import { PageHeader,Badge } from '@/components/UI';
import { requirePageUser } from '@/lib/page';
import { readJson } from '@/lib/storage';
import { getAssignments } from '@/services/assignments';
export default async function Assignments(){const user=await requirePageUser(['teacher','admin']);const [groups,assignments]=await Promise.all([readJson('groups',[]),getAssignments()]);return <AppShell user={user}><PageHeader eyebrow="Teaching workflow" title="Assignments" description="Create one group project, define the task and rubric, then follow every student's project diary."/><div className="two-col"><AssignmentManager groups={groups}/><section className="panel"><div className="panel-title"><h3>Published projects</h3><Badge>{assignments.length}</Badge></div>{assignments.map(a=><Link key={a.id} href={`/assignments/${a.id}`} className="project-row"><span><b>{a.title}</b><small>{groups.find(g=>g.id===a.groupId)?.name} · {a.startDate} → {a.deadline}</small></span><Badge tone="purple">Open diary</Badge></Link>)}</section></div></AppShell>}
