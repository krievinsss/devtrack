import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { createFormative,saveFormativeResult } from '@/services/formative';
const criterion=z.object({name:z.string().min(1),max:z.coerce.number().positive()});
const createSchema=z.object({action:z.literal('create'),assignmentId:z.string(),title:z.string().min(2),date:z.string(),description:z.string().optional(),criteria:z.array(criterion).min(1)});
const gradeSchema=z.object({action:z.literal('grade'),eventId:z.string(),studentId:z.string(),scores:z.array(z.object({name:z.string(),score:z.coerce.number().min(0)})),positive:z.string().optional(),improvement:z.string().optional(),feedback:z.string().optional()});
export async function POST(req){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{const body=await req.json();if(body.action==='create')return ok({event:await createFormative(createSchema.parse(body),auth.user)});if(body.action==='grade')return ok({result:await saveFormativeResult(gradeSchema.parse(body),auth.user)});return fail('Unknown action');}catch(e){return fail(e.message,400,e?.issues)}}
