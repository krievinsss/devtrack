import { z } from 'zod';
import { getUsers,patchUser } from '@/services/users';
import { createSession,setSessionCookie,teacherLoginEmail,verifyTeacherBootstrapPassword } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { fail,ok } from '@/lib/http';

const schema=z.object({email:z.string().email(),password:z.string().min(1)});

export async function POST(request){
  try{
    const body=schema.parse(await request.json());
    const email=body.email.trim().toLowerCase();
    const canonicalTeacherEmail=teacherLoginEmail();
    const users=await getUsers();
    let user=users.find(u=>u.email.toLowerCase()===email);
    if(!user&&email===canonicalTeacherEmail)user=users.find(u=>u.role==='teacher');
    if(!user)return fail('Nepareizs e-pasts vai parole',401);
    if(process.env.NODE_ENV==='production'&&user.role==='student'&&user.email.toLowerCase().endsWith('@devtrack.local'))return fail('Nepareizs e-pasts vai parole',401);

    const usedBootstrapPassword=!user.passwordHash;
    const valid=user.passwordHash
      ? verifyPassword(body.password,user.passwordHash)
      : user.role==='teacher'&&email===canonicalTeacherEmail&&verifyTeacherBootstrapPassword(body.password);

    if(!valid)return fail('Nepareizs e-pasts vai parole',401);

    if(user.role==='teacher'&&(user.email.toLowerCase()!==canonicalTeacherEmail||usedBootstrapPassword)){
      user=await patchUser(user.id,{email:canonicalTeacherEmail,...(usedBootstrapPassword?{mustChangePassword:true}:{}),updatedAt:new Date().toISOString()});
    }

    await setSessionCookie(await createSession(user));
    return ok({
      user:{id:user.id,role:user.role,name:`${user.firstName} ${user.lastName}`},
      mustChangePassword:Boolean(user.mustChangePassword),
      redirectTo:user.mustChangePassword?'/change-password':'/dashboard'
    });
  }catch(e){return fail('Invalid request',400,e?.issues);}
}
