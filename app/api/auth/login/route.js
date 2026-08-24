import { z } from 'zod';
import { getUsers } from '@/services/users';
import { createSession,setSessionCookie,verifyDemoPassword } from '@/lib/auth';
import { fail,ok } from '@/lib/http';
const schema=z.object({email:z.string().email(),password:z.string().min(1)});
export async function POST(request){ try{const body=schema.parse(await request.json()); const user=(await getUsers()).find(u=>u.email.toLowerCase()===body.email.toLowerCase()); if(!user||!verifyDemoPassword(body.password))return fail('Nepareizs e-pasts vai parole',401); await setSessionCookie(await createSession(user)); return ok({user:{id:user.id,role:user.role,name:`${user.firstName} ${user.lastName}`}});}catch(e){return fail('Invalid request',400,e?.issues);} }
