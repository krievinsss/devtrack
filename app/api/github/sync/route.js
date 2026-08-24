import { z } from 'zod';import { requireApiUser,fail,ok } from '@/lib/http';import { syncProject } from '@/services/github';
export async function POST(req){const auth=await requireApiUser();if(auth.error)return auth.error;try{const {projectId}=z.object({projectId:z.string()}).parse(await req.json());return ok({result:await syncProject(projectId)});}catch(e){return fail(e.message,502)}}
