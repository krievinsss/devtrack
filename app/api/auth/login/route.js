import { z } from 'zod';
import { getUsers } from '@/services/users';
import { createSession,setSessionCookie,verifyDemoPassword } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { fail,ok } from '@/lib/http';

const schema=z.object({email:z.string().email(),password:z.string().min(1)});

export async function POST(request){
  try{
    const body=schema.parse(await request.json());
    const user=(await getUsers()).find(u=>u.email.toLowerCase()===body.email.toLowerCase());
    if(!user)return fail('Nepareizs e-pasts vai parole',401);

    const valid=user.passwordHash
      ? verifyPassword(body.password,user.passwordHash)
      : verifyDemoPassword(body.password);

    if(!valid)return fail('Nepareizs e-pasts vai parole',401);

    await setSessionCookie(await createSession(user));
    return ok({
      user:{id:user.id,role:user.role,name:`${user.firstName} ${user.lastName}`},
      mustChangePassword:Boolean(user.mustChangePassword),
      redirectTo:user.mustChangePassword?'/change-password':'/dashboard'
    });
  }catch(e){return fail('Invalid request',400,e?.issues);}
}
