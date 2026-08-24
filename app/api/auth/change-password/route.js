import { z } from 'zod';
import { currentUser, createSession, setSessionCookie } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { patchUser } from '@/services/users';
import { fail, ok } from '@/lib/http';

const schema=z.object({password:z.string().min(8).max(128)});

export async function POST(req){
  const user=await currentUser();
  if(!user)return fail('Unauthorized',401);
  try{
    const {password}=schema.parse(await req.json());
    const updated=await patchUser(user.id,{passwordHash:hashPassword(password),mustChangePassword:false,passwordChangedAt:new Date().toISOString()});
    await setSessionCookie(await createSession(updated));
    return ok({redirectTo:'/dashboard'});
  }catch(e){return fail('Parolei jābūt vismaz 8 rakstzīmes garai',400,e?.issues);}
}
