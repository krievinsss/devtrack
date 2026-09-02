import { z } from 'zod';
import { after } from 'next/server';
import { requireApiUser,fail,ok } from '@/lib/http';
import { createFormative,processFormativeSideEffects,saveFormativeResult } from '@/services/formative';
import { notifyAssignmentStudents } from '@/services/notifications';
const criterion=z.object({name:z.string().min(1),max:z.coerce.number().positive()});
const createSchema=z.object({action:z.literal('create'),assignmentId:z.string(),title:z.string().min(2),date:z.string(),description:z.string().optional(),criteria:z.array(criterion).min(1)});
const gradeSchema=z.object({action:z.literal('grade'),eventId:z.string(),studentId:z.string(),scores:z.array(z.object({name:z.string(),score:z.coerce.number().min(0)})),positive:z.string().optional(),improvement:z.string().optional(),feedback:z.string().optional()});
export async function POST(req){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{const body=await req.json();if(body.action==='create'){const input=createSchema.parse(body),event=await createFormative(input,auth.user);after(()=>notifyAssignmentStudents(input.assignmentId,{type:'assessment',title:'Jauns formatīvais vērtējums',message:event.title,href:'/projects'}));return ok({event})}if(body.action==='grade'){const input=gradeSchema.parse(body),result=await saveFormativeResult(input,auth.user);after(()=>processFormativeSideEffects(input,result));return ok({result})}return fail('Unknown action');}catch(e){return fail(e.message,400,e?.issues)}}
