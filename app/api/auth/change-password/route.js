import { z } from 'zod';
import { currentUserWithCredentials, createSession, setSessionCookie } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { patchUser } from '@/services/users';
import { fail, ok } from '@/lib/http';

const schema=z.object({password:z.string().min(8).max(128),currentPassword:z.string().optional()});

export async function POST(req){
  const user=await currentUserWithCredentials();
  if(!user)return fail('Unauthorized',401);
  try{
    const {password,currentPassword}=schema.parse(await req.json());
    if(user.passwordHash&&!user.mustChangePassword&&!verifyPassword(currentPassword||'',user.passwordHash))return fail('Pašreizējā parole nav pareiza',401);
    const updated=await patchUser(user.id,{passwordHash:hashPassword(password),mustChangePassword:false,passwordChangedAt:new Date().toISOString()});
    await setSessionCookie(await createSession(updated));
    return ok({redirectTo:'/dashboard'});
  }catch(e){return fail('Parolei jābūt vismaz 8 rakstzīmes garai',400,e?.issues);}
}
