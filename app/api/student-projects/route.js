import { requireApiUser,fail,ok } from '@/lib/http';
import { getAssignments,assignmentIsActive } from '@/services/assignments';
import { getProjects } from '@/services/projects';
export async function GET(){const auth=await requireApiUser(['student']);if(auth.error)return auth.error;try{const[projects,assignments]=await Promise.all([getProjects(),getAssignments()]);const active=new Map(assignments.filter(assignmentIsActive).map(a=>[a.id,a]));const items=projects.filter(p=>p.studentId===auth.user.id&&active.has(p.assignmentId)).map(p=>({project:p,assignment:active.get(p.assignmentId)}));return ok({items})}catch(e){return fail(e.message||'Could not load projects',500)}}
