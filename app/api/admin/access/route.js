import crypto from 'node:crypto';
import { after } from 'next/server';
import { z } from 'zod';
import { MODULE_CATALOG,PERMISSION_CATALOG } from '@/db/catalog';
import { StaffAccessError } from '@/db/staffAccess';
import { requireApiUser,fail,ok } from '@/lib/http';
import { hashPassword } from '@/lib/password';
import { mirrorCoreDirectoryToBlob } from '@/services/coreDirectory';
import { createStaffAccess,getStaffAccessSnapshot,resetStaffAccessPassword,updateStaffAccess } from '@/services/staffAccess';

const moduleKeys=MODULE_CATALOG.map(item=>item.key),permissionKeys=PERMISSION_CATALOG.map(item=>item.key);
const staffSchema=z.object({
  id:z.string().trim().min(1).optional(),
  firstName:z.string().trim().min(1).max(100),
  lastName:z.string().trim().min(1).max(100),
  email:z.string().trim().email().max(320).transform(value=>value.toLowerCase()),
  schoolRole:z.enum(['teacher','school_admin']),
  active:z.boolean().default(true),
  groupIds:z.array(z.string().trim().min(1)).max(500).default([]),
  moduleKeys:z.array(z.enum(moduleKeys)).max(moduleKeys.length).default([]),
  permissionKeys:z.array(z.enum(permissionKeys)).max(permissionKeys.length).default([])
});
const resetSchema=z.object({id:z.string().trim().min(1)});

async function administrator(){return requireApiUser(['admin'],{module:'administration',permission:'administration.manage_access'})}
function context(user){return{schoolId:user.schoolId,actorUserId:user.id,actorPlatformRole:user.platformRole}}
function temporaryPassword(){return `Dev-${crypto.randomBytes(5).toString('hex')}`}
function scheduleMirror(){after(()=>mirrorCoreDirectoryToBlob())}

export async function GET(){
  const auth=await administrator();if(auth.error)return auth.error;
  try{return ok({...await getStaffAccessSnapshot({schoolId:auth.user.schoolId}),viewer:{id:auth.user.id,platformRole:auth.user.platformRole}})}catch(error){return accessError(error)}
}

export async function POST(req){
  const auth=await administrator();if(auth.error)return auth.error;
  try{
    const body=await req.json();
    if(body.action==='create'){
      const input=staffSchema.omit({id:true}).parse(body.staff),password=temporaryPassword(),id=`teacher_${crypto.randomBytes(6).toString('hex')}`;
      await createStaffAccess({...input,id,passwordHash:hashPassword(password)},context(auth.user));
      const snapshot=await getStaffAccessSnapshot({schoolId:auth.user.schoolId});scheduleMirror();
      return ok({...snapshot,createdId:id,temporaryPassword:password});
    }
    if(body.action==='update'){
      const input=staffSchema.extend({id:z.string().trim().min(1)}).parse(body.staff);
      await updateStaffAccess(input,context(auth.user));
      const snapshot=await getStaffAccessSnapshot({schoolId:auth.user.schoolId});scheduleMirror();
      return ok({...snapshot,updatedId:input.id});
    }
    if(body.action==='resetPassword'){
      const {id}=resetSchema.parse(body),password=temporaryPassword();
      await resetStaffAccessPassword({id,passwordHash:hashPassword(password)},context(auth.user));
      const snapshot=await getStaffAccessSnapshot({schoolId:auth.user.schoolId});scheduleMirror();
      return ok({...snapshot,updatedId:id,temporaryPassword:password});
    }
    return fail('Unknown action',400);
  }catch(error){return accessError(error)}
}

function accessError(error){
  console.error('Staff access management failed',{message:error?.message||'Unknown error'});
  if(error instanceof StaffAccessError)return fail(error.message,error.status);
  if(error?.name==='ZodError')return fail('Invalid staff access data',400,error.issues);
  if(error?.code==='23505'||error?.cause?.code==='23505')return fail('Šāds e-pasts jau ir reģistrēts',409);
  return fail(error?.message||'Staff access could not be saved',500);
}
