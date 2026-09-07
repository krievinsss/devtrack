import 'server-only';
import { database,databaseConfigured,withTransactionDatabase } from '@/db/client';
import { createDirectoryGroup,createDirectoryStudents,defaultSchoolId,deleteDirectoryGroup,deleteDirectoryStudent,directoryReady,legacyAccess,loadAccess,loadDirectory,patchDirectoryUser,removeDirectoryStudentFromGroup,renameDirectoryGroup } from '@/db/directory';
import { readJson,updateJson,writeJson } from '@/lib/storage';

const CACHE_MS=500;
let cache=null;

export function coreStorageMode(){
  const value=String(process.env.DEVTRACK_CORE_STORAGE||'auto').trim().toLowerCase();
  return ['auto','blob','neon'].includes(value)?value:'auto';
}

export async function getCoreDirectory({fresh=false}={}){
  if(!fresh&&cache&&cache.expires>Date.now())return cache.promise;
  const promise=loadPreferredDirectory();
  cache={expires:Date.now()+CACHE_MS,promise};
  try{return await promise}catch(error){cache=null;throw error}
}

export async function getCoreUsers(options){return (await getCoreDirectory(options)).users}
export async function getCoreGroups(options){return (await getCoreDirectory(options)).groups}
export async function getCoreUser(id,options){return (await getCoreUsers(options)).find(user=>user.id===id)||null}

export async function getCoreUserWithAccess(id){
  const user=await getCoreUser(id,{fresh:true});if(!user)return null;
  let access;
  if(user.membershipId&&user.schoolId&&databaseConfigured()&&coreStorageMode()!=='blob'){
    try{access=await loadAccess(database(),user)}catch(error){throw new CoreDirectoryUnavailableError('Could not verify account access',error)}
  }else access=legacyAccess(user);
  return {...user,moduleKeys:access.moduleKeys,permissionKeys:access.permissionKeys};
}

export async function patchCoreUser(id,patch,{actorUserId=null}={}){
  const useNeon=await writableDatabase();
  if(!useNeon){
    let result=null;
    await updateJson('users',[],items=>items.map(user=>{if(user.id!==id)return user;result={...user,...patch};return result}));
    invalidateCoreDirectory();return result;
  }
  const updated=await withTransactionDatabase(db=>patchDirectoryUser(db,id,patch,{schoolId:defaultSchoolId(),actorUserId}));
  invalidateCoreDirectory();
  return updated?getCoreUser(id,{fresh:true}):null;
}

export async function createCoreGroup(group,{actorUserId=null}={}){
  const useNeon=await writableDatabase();
  if(!useNeon){await updateJson('groups',[],items=>{if(items.some(item=>item.name.toLowerCase()===group.name.toLowerCase()))throw new Error('Grupa ar šādu nosaukumu jau eksistē');return [...items,group]});invalidateCoreDirectory();return group}
  await withTransactionDatabase(db=>createDirectoryGroup(db,group,{schoolId:defaultSchoolId(),actorUserId}));invalidateCoreDirectory();
  return (await getCoreGroups({fresh:true})).find(item=>item.id===group.id)||null;
}

export async function renameCoreGroup(groupId,name,{actorUserId=null}={}){
  const useNeon=await writableDatabase();
  if(!useNeon){let result=null;await updateJson('groups',[],items=>items.map(group=>group.id===groupId?(result={...group,name,updatedAt:new Date().toISOString()}):group));invalidateCoreDirectory();return result}
  const updated=await withTransactionDatabase(db=>renameDirectoryGroup(db,groupId,name,{schoolId:defaultSchoolId(),actorUserId}));invalidateCoreDirectory();
  return updated?(await getCoreGroups({fresh:true})).find(item=>item.id===groupId)||null:null;
}

export async function deleteCoreGroup(groupId,{actorUserId=null}={}){
  const useNeon=await writableDatabase();
  if(!useNeon){
    const now=new Date().toISOString();
    await Promise.all([updateJson('groups',[],items=>items.filter(group=>group.id!==groupId)),updateJson('users',[],items=>items.map(user=>({...user,groupIds:(user.groupIds||[]).filter(id=>id!==groupId),updatedAt:now})))]);
    invalidateCoreDirectory();return true;
  }
  const deleted=await withTransactionDatabase(db=>deleteDirectoryGroup(db,groupId,{schoolId:defaultSchoolId(),actorUserId}));invalidateCoreDirectory();return deleted;
}

export async function createCoreStudents(students,groupId,{actorUserId=null}={}){
  if(!students.length)return [];
  const useNeon=await writableDatabase();
  if(!useNeon){
    const ids=students.map(student=>student.id),now=new Date().toISOString();let target=null;
    await Promise.all([
      updateJson('users',[],items=>[...items,...students]),
      updateJson('groups',[],items=>items.map(group=>group.id===groupId?(target={...group,studentIds:[...(group.studentIds||[]),...ids],updatedAt:now}):group))
    ]);
    if(!target)throw new Error('Group not found');invalidateCoreDirectory();return students;
  }
  const ids=await withTransactionDatabase(db=>createDirectoryStudents(db,students,groupId,{schoolId:defaultSchoolId(),actorUserId}));invalidateCoreDirectory();
  const created=new Set(ids);return (await getCoreUsers({fresh:true})).filter(user=>created.has(user.id));
}

export async function removeCoreStudentFromGroup(studentId,groupId,{actorUserId=null}={}){
  const useNeon=await writableDatabase();
  if(!useNeon){
    const now=new Date().toISOString();
    await Promise.all([
      updateJson('groups',[],items=>items.map(group=>group.id===groupId?{...group,studentIds:(group.studentIds||[]).filter(id=>id!==studentId),updatedAt:now}:group)),
      updateJson('users',[],items=>items.map(user=>user.id===studentId?{...user,groupIds:(user.groupIds||[]).filter(id=>id!==groupId),updatedAt:now}:user))
    ]);
    invalidateCoreDirectory();return true;
  }
  const removed=await withTransactionDatabase(db=>removeDirectoryStudentFromGroup(db,studentId,groupId,{schoolId:defaultSchoolId(),actorUserId}));invalidateCoreDirectory();return removed;
}

export async function deleteCoreStudent(studentId,{actorUserId=null}={}){
  const useNeon=await writableDatabase();
  if(!useNeon){
    await Promise.all([updateJson('users',[],items=>items.filter(user=>user.id!==studentId)),updateJson('groups',[],items=>items.map(group=>({...group,studentIds:(group.studentIds||[]).filter(id=>id!==studentId),updatedAt:new Date().toISOString()})))]);
    invalidateCoreDirectory();return true;
  }
  const deleted=await withTransactionDatabase(db=>deleteDirectoryStudent(db,studentId,{schoolId:defaultSchoolId(),actorUserId}));invalidateCoreDirectory();return deleted;
}

export async function mirrorCoreDirectoryToBlob(){
  if(!process.env.VERCEL||!databaseConfigured()||coreStorageMode()==='blob')return false;
  try{
    const directory=await loadDirectory(database(),defaultSchoolId());if(!directory)return false;
    await Promise.all([writeJson('users',directory.users.map(stripDatabaseMetadata)),writeJson('groups',directory.groups.map(stripDatabaseMetadata))]);return true;
  }catch(error){console.error('Core directory Blob mirror failed',{message:error?.message||'Unknown error'});return false}
}

export function invalidateCoreDirectory(){cache=null}

async function loadPreferredDirectory(){
  if(coreStorageMode()!=='blob'&&databaseConfigured()){
    try{const directory=await loadDirectory(database(),defaultSchoolId());if(directory)return directory}
    catch(error){if(coreStorageMode()==='auto'&&schemaMissing(error))return legacyDirectory();throw new CoreDirectoryUnavailableError('Neon core directory is unavailable',error)}
  }
  return legacyDirectory();
}

async function legacyDirectory(){const [users,groups]=await Promise.all([readJson('users',[]),readJson('groups',[])]);return{users,groups,source:'blob'}}

async function writableDatabase(){
  if(coreStorageMode()==='blob'||!databaseConfigured())return null;
  try{
    const db=database(),ready=await directoryReady(db,defaultSchoolId());
    if(ready)return true;
    if(coreStorageMode()==='neon')throw new CoreDirectoryUnavailableError('Neon has not been initialized');
    return null;
  }catch(error){
    if(error instanceof CoreDirectoryUnavailableError)throw error;
    if(coreStorageMode()==='auto'&&schemaMissing(error))return null;
    throw new CoreDirectoryUnavailableError('Neon is temporarily unavailable; no changes were saved',error);
  }
}

function stripDatabaseMetadata(value){const {membershipId,membershipStatus,schoolId,schoolRole,platformRole,...legacy}=value;return legacy}
function schemaMissing(error){const message=String(error?.message||error?.cause?.message||'').toLowerCase(),coreRelation=['schools','users','school_memberships','groups'].some(name=>message.includes(name));return error?.code==='42P01'||error?.cause?.code==='42P01'||message.includes('does not exist')&&coreRelation}

export class CoreDirectoryUnavailableError extends Error{
  constructor(message,cause){super(message,{cause});this.name='CoreDirectoryUnavailableError'}
}
