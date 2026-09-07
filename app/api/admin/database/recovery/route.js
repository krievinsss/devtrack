import { after } from 'next/server';
import { z } from 'zod';
import { CoreRecoveryError } from '@/db/recovery';
import { fail,ok,requireApiUser } from '@/lib/http';
import { mirrorCoreDirectoryToBlob } from '@/services/coreDirectory';
import { getCoreRecoveryAudit,restoreCoreGroupFromEvidence } from '@/services/coreRecovery';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const restoreSchema=z.object({
  action:z.literal('restoreGroup'),groupId:z.string().trim().min(1).max(200),name:z.string().trim().min(1).max(100),
  confirmation:z.literal('RESTORE_ORPHANED_GROUP')
});

async function administrator(){return requireApiUser(['admin'],{module:'administration',permission:'administration.manage_school'})}

export async function GET(){
  const auth=await administrator();if(auth.error)return auth.error;
  try{return ok({audit:await getCoreRecoveryAudit()})}catch(error){return recoveryError(error)}
}

export async function POST(req){
  const auth=await administrator();if(auth.error)return auth.error;
  try{
    const input=restoreSchema.parse(await req.json());
    const restored=await restoreCoreGroupFromEvidence(input,auth.user);
    after(()=>mirrorCoreDirectoryToBlob());
    return ok({restored});
  }catch(error){return recoveryError(error)}
}

function recoveryError(error){
  console.error('Core recovery failed',{message:error?.message||'Unknown error'});
  if(error instanceof CoreRecoveryError)return fail(error.message,error.status);
  if(error?.name==='ZodError')return fail('Invalid recovery data',400,error.issues);
  if(error?.code==='23505'||error?.cause?.code==='23505')return fail('The group already exists',409);
  return fail('Could not audit or restore the missing group',500);
}
