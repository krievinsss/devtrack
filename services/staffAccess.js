import 'server-only';
import { database,databaseConfigured,withTransactionDatabase } from '@/db/client';
import { defaultSchoolId,directoryReady } from '@/db/directory';
import { createStaffMember,loadStaffAccess,resetStaffPassword,StaffAccessError,updateStaffMember } from '@/db/staffAccess';
import { invalidateCoreDirectory } from '@/services/coreDirectory';

export async function getStaffAccessSnapshot({schoolId=defaultSchoolId()}={}){
  await requireStaffDatabase(schoolId);
  return loadStaffAccess(database(),schoolId);
}

export async function createStaffAccess(input,context){
  const schoolId=context.schoolId||defaultSchoolId();
  await requireStaffDatabase(schoolId);
  const id=await withTransactionDatabase(db=>createStaffMember(db,input,{...context,schoolId}));
  invalidateCoreDirectory();
  return id;
}

export async function updateStaffAccess(input,context){
  const schoolId=context.schoolId||defaultSchoolId();
  await requireStaffDatabase(schoolId);
  const id=await withTransactionDatabase(db=>updateStaffMember(db,input,{...context,schoolId}));
  invalidateCoreDirectory();
  return id;
}

export async function resetStaffAccessPassword(input,context){
  const schoolId=context.schoolId||defaultSchoolId();
  await requireStaffDatabase(schoolId);
  const id=await withTransactionDatabase(db=>resetStaffPassword(db,input,{...context,schoolId}));
  invalidateCoreDirectory();
  return id;
}

async function requireStaffDatabase(schoolId){
  if(!databaseConfigured())throw new StaffAccessError('Neon Postgres must be configured before staff access can be managed',503);
  try{
    if(!await directoryReady(database(),schoolId))throw new StaffAccessError('Initialize and import the Neon core directory first',503);
  }catch(error){
    if(error instanceof StaffAccessError)throw error;
    throw new StaffAccessError('Staff access is temporarily unavailable',503);
  }
}
