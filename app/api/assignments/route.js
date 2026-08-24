import { z } from 'zod';
import { requireApiUser,fail,ok } from '@/lib/http';
import { createAssignment } from '@/services/assignments';
import { sanitizeRichText } from '@/lib/richText';
const criterion=z.object({name:z.string().min(1),max:z.coerce.number().positive()});
const schema=z.object({title:z.string().min(2),groupId:z.string(),description:z.string().min(2),descriptionHtml:z.string().optional().default(''),requirements:z.array(z.string()).default([]),technologies:z.array(z.string()).default([]),rubric:z.array(criterion).min(1),startDate:z.string(),deadline:z.string()});
export async function POST(req){const auth=await requireApiUser(['teacher','admin']);if(auth.error)return auth.error;try{const body=schema.parse(await req.json());body.descriptionHtml=sanitizeRichText(body.descriptionHtml||'');return ok({assignment:await createAssignment(body,auth.user)});}catch(e){return fail(e.message,400,e?.issues)}}
