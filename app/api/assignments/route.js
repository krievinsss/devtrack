import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { createAssignment,deleteAssignment,getAssignments,updateAssignment,setAssignmentActive } from '@/services/assignments';
import { sanitizeRichText } from '@/lib/richText';
const level=z.object({points:z.coerce.number().min(0),label:z.string().default('')});
const criterion=z.object({name:z.string().min(1),max:z.coerce.number().positive(),description:z.string().optional().default(''),imageUrl:z.string().optional().default(''),levels:z.array(level).optional().default([])});
const base=z.object({title:z.string().min(2),groupId:z.string(),description:z.string().min(2),descriptionHtml:z.string().optional().default(''),requirements:z.array(z.string()).default([]),technologies:z.array(z.string()).default([]),rubric:z.array(criterion).min(1),startDate:z.string(),deadline:z.string(),active:z.boolean().optional().default(false)});
function clean(body){body.descriptionHtml=sanitizeRichText(body.descriptionHtml||'');body.rubric=body.rubric.map(c=>({...c,imageUrl:/^https?:\/\//i.test(c.imageUrl||'')?c.imageUrl:''}));return body}
export async function GET(){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{return ok({assignments:await getAssignments()})}catch(e){return fail(e.message,500)}}
export async function POST(req){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{return ok({assignment:await createAssignment(clean(base.parse(await req.json())),auth.user)});}catch(e){return fail(e.message,400,e?.issues)}}
export async function PATCH(req){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{const raw=await req.json();const id=z.string().parse(raw.id);if(Object.keys(raw).every(k=>['id','active'].includes(k))&&typeof raw.active==='boolean')return ok({assignment:await setAssignmentActive(id,raw.active,auth.user)});return ok({assignment:await updateAssignment(id,clean(base.parse(raw)),auth.user)});}catch(e){return fail(e.message,400,e?.issues)}}
export async function DELETE(req){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{const {id}=z.object({id:z.string()}).parse(await req.json());return ok({assignment:await deleteAssignment(id)})}catch(e){return fail(e.message,400,e?.issues)}}
