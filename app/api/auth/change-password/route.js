import { z } from 'zod';
import { after } from 'next/server';
import { currentUserWithCredentials, createSession, setSessionCookie } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { patchUser } from '@/services/users';
import { mirrorCoreDirectoryToBlob } from '@/services/coreDirectory';
import { fail, ok } from '@/lib/http';

const schema=z.object({password:z.string().min(8).max(128),currentPassword:z.string().optional()});

export async function POST(req){
  try{
    const user=await currentUserWithCredentials();
    if(!user)return fail('Unauthorized',401);
    const {password,currentPassword}=schema.parse(await req.json());
    if(user.passwordHash&&!user.mustChangePassword&&!verifyPassword(currentPassword||'',user.passwordHash))return fail('Pašreizējā parole nav pareiza',401);
    const updated=await patchUser(user.id,{passwordHash:hashPassword(password),mustChangePassword:false,passwordChangedAt:new Date().toISOString()},{actorUserId:user.id});
    after(()=>mirrorCoreDirectoryToBlob());
    await setSessionCookie(await createSession(updated));
    return ok({redirectTo:'/dashboard'});
  }catch(e){if(e instanceof z.ZodError)return fail('Parolei jābūt vismaz 8 rakstzīmes garai',400,e.issues);console.error('Password update storage failed',{message:e?.message||'Unknown error'});return fail('Password update temporarily unavailable',503);}
}
