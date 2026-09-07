import { z } from 'zod';
import { after } from 'next/server';
import { getUsersWithCredentials,patchUser } from '@/services/users';
import { mirrorCoreDirectoryToBlob } from '@/services/coreDirectory';
import { createSession,setSessionCookie,teacherLoginEmail,verifyTeacherBootstrapPassword } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { fail,ok } from '@/lib/http';

const schema=z.object({email:z.string().email(),password:z.string().min(1)});

export async function POST(request){
  try{
    const body=schema.parse(await request.json());
    const email=body.email.trim().toLowerCase();
    const canonicalTeacherEmail=teacherLoginEmail();
    const users=await getUsersWithCredentials();
    let user=users.find(u=>u.email.toLowerCase()===email);
    if(!user&&email===canonicalTeacherEmail)user=users.find(u=>u.role==='teacher');
    if(!user)return fail('Nepareizs e-pasts vai parole',401);
    if(user.active===false)return fail('Šis konts nav aktīvs',403);
    if(process.env.NODE_ENV==='production'&&user.role==='student'&&user.email.toLowerCase().endsWith('@devtrack.local'))return fail('Nepareizs e-pasts vai parole',401);

    const usedBootstrapPassword=!user.passwordHash;
    const valid=user.passwordHash
      ? verifyPassword(body.password,user.passwordHash)
      : ['teacher','admin'].includes(user.role)&&email===canonicalTeacherEmail&&verifyTeacherBootstrapPassword(body.password);

    if(!valid)return fail('Nepareizs e-pasts vai parole',401);

    if(['teacher','admin'].includes(user.role)&&(user.email.toLowerCase()!==canonicalTeacherEmail||usedBootstrapPassword)){
      user=await patchUser(user.id,{email:canonicalTeacherEmail,...(usedBootstrapPassword?{mustChangePassword:true}:{}),updatedAt:new Date().toISOString()},{actorUserId:user.id});
      after(()=>mirrorCoreDirectoryToBlob());
    }

    await setSessionCookie(await createSession(user));
    return ok({
      user:{id:user.id,role:user.role,name:`${user.firstName} ${user.lastName}`},
      mustChangePassword:Boolean(user.mustChangePassword),
      redirectTo:user.mustChangePassword?'/change-password':'/dashboard'
    });
  }catch(e){if(e instanceof z.ZodError)return fail('Invalid request',400,e.issues);console.error('Login storage failed',{message:e?.message||'Unknown error'});return fail('Login temporarily unavailable',503);}
}
