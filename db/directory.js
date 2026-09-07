import { and,eq,inArray,sql } from 'drizzle-orm';
import { resolveAccess } from './access.js';
import { MODULE_CATALOG,PERMISSION_CATALOG,STUDENT_MODULE_PRESETS } from './catalog.js';
import { auditLogs,groupMemberships,groups,membershipModuleAccess,membershipPermissionOverrides,schoolMemberships,schoolModuleAccess,schools,users } from './schema.js';

const USER_RESERVED_KEYS=new Set(['id','email','firstName','lastName','passwordHash','platformRole','role','schoolRole','active','mustChangePassword','groupIds','membershipId','membershipStatus','schoolId','createdAt','updatedAt','moduleKeys','permissionKeys','hasPassword']);
const GROUP_RESERVED_KEYS=new Set(['id','schoolId','name','academicYear','active','studentIds','teacherIds','createdAt','updatedAt']);

export function defaultSchoolId(){return String(process.env.DEVTRACK_SCHOOL_ID||'school_vtdt').trim()}
export function legacyRoleForSchoolRole(role){return role==='school_admin'?'admin':role==='teacher'?'teacher':'student'}
export function schoolRoleForLegacyRole(role){return ['admin','school_admin'].includes(role)?'school_admin':role==='teacher'?'teacher':'student'}

export function legacyUserProfile(raw={}){
  const profile={};
  for(const [key,value] of Object.entries(raw))if(!USER_RESERVED_KEYS.has(key)&&value!==undefined)profile[key]=value;
  return profile;
}

export function legacyGroupRefs(raw={}){
  const refs={};
  for(const [key,value] of Object.entries(raw))if(!GROUP_RESERVED_KEYS.has(key)&&value!==undefined)refs[key]=value;
  return refs;
}

export function materializeDirectory({memberRows=[],groupRows=[],relationRows=[]}){
  const groupsByUser=new Map(),studentsByGroup=new Map(),teachersByGroup=new Map();
  for(const relation of relationRows){
    if(!groupsByUser.has(relation.userId))groupsByUser.set(relation.userId,[]);
    groupsByUser.get(relation.userId).push(relation.groupId);
    const target=relation.relation==='student'?studentsByGroup:teachersByGroup;
    if(!target.has(relation.groupId))target.set(relation.groupId,[]);
    target.get(relation.groupId).push({userId:relation.userId,relation:relation.relation});
  }

  const legacyUsers=memberRows.map(row=>({
    ...(row.profile&&typeof row.profile==='object'?row.profile:{}),
    id:row.id,email:row.email,firstName:row.firstName,lastName:row.lastName,passwordHash:row.passwordHash,
    platformRole:row.platformRole,role:legacyRoleForSchoolRole(row.schoolRole),schoolRole:row.schoolRole,
    active:row.active&&row.membershipStatus==='active',mustChangePassword:row.mustChangePassword,
    groupIds:[...new Set(groupsByUser.get(row.id)||[])],membershipId:row.membershipId,
    membershipStatus:row.membershipStatus,schoolId:row.schoolId,
    createdAt:iso(row.createdAt),updatedAt:iso(row.updatedAt)
  }));

  const legacyGroups=groupRows.map(row=>({
    ...(row.externalRefs&&typeof row.externalRefs==='object'?row.externalRefs:{}),
    id:row.id,schoolId:row.schoolId,name:row.name,academicYear:row.academicYear,active:row.active,
    studentIds:(studentsByGroup.get(row.id)||[]).map(item=>item.userId),
    teacherIds:(teachersByGroup.get(row.id)||[]).sort((a,b)=>relationPriority(b.relation)-relationPriority(a.relation)).map(item=>item.userId),
    createdAt:iso(row.createdAt),updatedAt:iso(row.updatedAt)
  }));

  return {users:legacyUsers,groups:legacyGroups,source:'neon'};
}

export async function loadDirectory(db,schoolId=defaultSchoolId()){
  const memberRows=await db.select({
    id:users.id,email:users.email,firstName:users.firstName,lastName:users.lastName,passwordHash:users.passwordHash,
    platformRole:users.platformRole,active:users.active,mustChangePassword:users.mustChangePassword,profile:users.profile,
    createdAt:users.createdAt,updatedAt:users.updatedAt,membershipId:schoolMemberships.id,
    membershipStatus:schoolMemberships.status,schoolRole:schoolMemberships.role,schoolId:schoolMemberships.schoolId
  }).from(users).innerJoin(schoolMemberships,and(eq(schoolMemberships.userId,users.id),eq(schoolMemberships.schoolId,schoolId)));
  if(!memberRows.length)return null;
  const [groupRows,relationRows]=await Promise.all([
    db.select().from(groups).where(eq(groups.schoolId,schoolId)),
    db.select({groupId:groupMemberships.groupId,userId:schoolMemberships.userId,relation:groupMemberships.relation})
      .from(groupMemberships).innerJoin(schoolMemberships,eq(schoolMemberships.id,groupMemberships.membershipId))
      .where(eq(schoolMemberships.schoolId,schoolId))
  ]);
  return materializeDirectory({memberRows,groupRows,relationRows});
}

export async function loadAccess(db,user){
  const [schoolOverrides,membershipOverrides,permissionOverrides]=await Promise.all([
    db.select({moduleKey:schoolModuleAccess.moduleKey,enabled:schoolModuleAccess.enabled}).from(schoolModuleAccess).where(eq(schoolModuleAccess.schoolId,user.schoolId)),
    db.select({moduleKey:membershipModuleAccess.moduleKey,enabled:membershipModuleAccess.enabled}).from(membershipModuleAccess).where(eq(membershipModuleAccess.membershipId,user.membershipId)),
    db.select({permissionKey:membershipPermissionOverrides.permissionKey,effect:membershipPermissionOverrides.effect}).from(membershipPermissionOverrides).where(eq(membershipPermissionOverrides.membershipId,user.membershipId))
  ]);
  return resolveAccess({platformRole:user.platformRole,schoolRole:user.schoolRole,schoolOverrides,membershipOverrides,permissionOverrides});
}

export function legacyAccess(user){
  if(user.role!=='student')return{moduleKeys:MODULE_CATALOG.map(item=>item.key),permissionKeys:PERMISSION_CATALOG.map(item=>item.key),can:()=>true};
  const schoolRole=schoolRoleForLegacyRole(user.role);
  const moduleKeys=STUDENT_MODULE_PRESETS.programming;
  const membershipOverrides=moduleKeys.map(moduleKey=>({moduleKey,enabled:true}));
  return resolveAccess({platformRole:'user',schoolRole,membershipOverrides});
}

export async function directoryReady(db,schoolId=defaultSchoolId()){
  const rows=await db.select({id:schools.id}).from(schools).where(eq(schools.id,schoolId)).limit(1);
  return rows.length>0;
}

export async function patchDirectoryUser(db,userId,patch,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  return db.transaction(async tx=>{
    const rows=await tx.select({user:users,membership:schoolMemberships}).from(users)
      .innerJoin(schoolMemberships,and(eq(schoolMemberships.userId,users.id),eq(schoolMemberships.schoolId,schoolId)))
      .where(eq(users.id,userId)).limit(1);
    const current=rows[0];if(!current)return null;
    const updatedAt=safeDate(patch.updatedAt,new Date()),profile={...(current.user.profile||{})};
    for(const [key,value] of Object.entries(patch))if(!USER_RESERVED_KEYS.has(key)&&value!==undefined)profile[key]=value;
    const userSet={profile,updatedAt};
    for(const key of ['email','firstName','lastName','passwordHash','platformRole','active','mustChangePassword'])if(patch[key]!==undefined)userSet[key]=patch[key];
    await tx.update(users).set(userSet).where(eq(users.id,userId));
    if(patch.role!==undefined||patch.schoolRole!==undefined){
      const role=patch.schoolRole||schoolRoleForLegacyRole(patch.role);
      await tx.update(schoolMemberships).set({role,updatedAt}).where(eq(schoolMemberships.id,current.membership.id));
    }
    if(Array.isArray(patch.groupIds))await replaceUserGroups(tx,current.membership.id,patch.groupIds,patch.schoolRole||schoolRoleForLegacyRole(patch.role||legacyRoleForSchoolRole(current.membership.role)),schoolId);
    await audit(tx,{schoolId,actorUserId:actorUserId||userId,action:'directory.user_updated',entityType:'user',entityId:userId,metadata:{fields:Object.keys(patch).filter(key=>key!=='passwordHash')}});
    return userId;
  });
}

export async function createDirectoryGroup(db,group,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  const now=new Date(),row={id:group.id,schoolId,name:group.name,academicYear:group.academicYear||null,active:group.active!==false,externalRefs:legacyGroupRefs(group),createdAt:safeDate(group.createdAt,now),updatedAt:safeDate(group.updatedAt,now)};
  await db.transaction(async tx=>{await tx.insert(groups).values(row);await audit(tx,{schoolId,actorUserId,action:'directory.group_created',entityType:'group',entityId:group.id,metadata:{name:group.name}})});
  return group.id;
}

export async function renameDirectoryGroup(db,groupId,name,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  return db.transaction(async tx=>{
    const rows=await tx.update(groups).set({name,updatedAt:new Date()}).where(and(eq(groups.id,groupId),eq(groups.schoolId,schoolId))).returning({id:groups.id});
    if(!rows.length)return null;
    await audit(tx,{schoolId,actorUserId,action:'directory.group_updated',entityType:'group',entityId:groupId,metadata:{name}});return groupId;
  });
}

export async function deleteDirectoryGroup(db,groupId,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  return db.transaction(async tx=>{
    const rows=await tx.delete(groups).where(and(eq(groups.id,groupId),eq(groups.schoolId,schoolId))).returning({id:groups.id});
    if(!rows.length)return false;
    await audit(tx,{schoolId,actorUserId,action:'directory.group_deleted',entityType:'group',entityId:groupId});return true;
  });
}

export async function createDirectoryStudents(db,studentRows,groupId,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  if(!studentRows.length)return [];
  return db.transaction(async tx=>{
    const target=await tx.select({id:groups.id}).from(groups).where(and(eq(groups.id,groupId),eq(groups.schoolId,schoolId))).limit(1);
    if(!target.length)throw new Error('Group not found');
    const now=new Date();
    await tx.insert(users).values(studentRows.map(raw=>({
      id:raw.id,email:String(raw.email).trim().toLowerCase(),firstName:raw.firstName,lastName:raw.lastName,passwordHash:raw.passwordHash||null,
      platformRole:'user',active:raw.active!==false,mustChangePassword:Boolean(raw.mustChangePassword),profile:legacyUserProfile(raw),
      createdAt:safeDate(raw.createdAt,now),updatedAt:safeDate(raw.updatedAt,now)
    })));
    const memberships=await tx.insert(schoolMemberships).values(studentRows.map(raw=>({schoolId,userId:raw.id,role:'student',status:raw.active===false?'suspended':'active',isPrimary:true,joinedAt:safeDate(raw.createdAt,now),createdAt:safeDate(raw.createdAt,now),updatedAt:safeDate(raw.updatedAt,now)}))).returning({id:schoolMemberships.id,userId:schoolMemberships.userId});
    await tx.insert(groupMemberships).values(memberships.map(row=>({groupId,membershipId:row.id,relation:'student'})));
    const moduleRows=memberships.flatMap(row=>STUDENT_MODULE_PRESETS.programming.map(moduleKey=>({membershipId:row.id,moduleKey,enabled:true,configuredByUserId:actorUserId})));
    for(const rows of chunks(moduleRows,500))await tx.insert(membershipModuleAccess).values(rows).onConflictDoNothing();
    await tx.update(groups).set({updatedAt:now}).where(eq(groups.id,groupId));
    await audit(tx,{schoolId,actorUserId,action:'directory.students_created',entityType:'group',entityId:groupId,metadata:{studentIds:studentRows.map(row=>row.id),count:studentRows.length}});
    return studentRows.map(row=>row.id);
  });
}

export async function removeDirectoryStudentFromGroup(db,studentId,groupId,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  return db.transaction(async tx=>{
    const membership=await tx.select({id:schoolMemberships.id}).from(schoolMemberships).where(and(eq(schoolMemberships.schoolId,schoolId),eq(schoolMemberships.userId,studentId))).limit(1);
    if(!membership.length)return false;
    const removed=await tx.delete(groupMemberships).where(and(eq(groupMemberships.groupId,groupId),eq(groupMemberships.membershipId,membership[0].id))).returning({groupId:groupMemberships.groupId});
    if(!removed.length)return false;
    await tx.update(groups).set({updatedAt:new Date()}).where(eq(groups.id,groupId));
    await audit(tx,{schoolId,actorUserId,action:'directory.student_removed_from_group',entityType:'group',entityId:groupId,metadata:{studentId}});return true;
  });
}

export async function deleteDirectoryStudent(db,studentId,{schoolId=defaultSchoolId(),actorUserId=null}={}){
  return db.transaction(async tx=>{
    const membership=await tx.select({id:schoolMemberships.id}).from(schoolMemberships).where(and(eq(schoolMemberships.schoolId,schoolId),eq(schoolMemberships.userId,studentId),eq(schoolMemberships.role,'student'))).limit(1);
    if(!membership.length)return false;
    await audit(tx,{schoolId,actorUserId,action:'directory.student_deleted',entityType:'user',entityId:studentId});
    await tx.delete(schoolMemberships).where(eq(schoolMemberships.id,membership[0].id));
    const remaining=await tx.select({count:sql`count(*)::int`}).from(schoolMemberships).where(eq(schoolMemberships.userId,studentId));
    if(Number(remaining[0]?.count||0)===0)await tx.delete(users).where(eq(users.id,studentId));
    return true;
  });
}

async function replaceUserGroups(tx,membershipId,groupIds,schoolRole,schoolId){
  const unique=[...new Set(groupIds.map(String))];
  if(unique.length){const valid=await tx.select({id:groups.id}).from(groups).where(and(eq(groups.schoolId,schoolId),inArray(groups.id,unique)));if(valid.length!==unique.length)throw new Error('One or more groups were not found')}
  await tx.delete(groupMemberships).where(eq(groupMemberships.membershipId,membershipId));
  if(unique.length)await tx.insert(groupMemberships).values(unique.map((groupId,index)=>({groupId,membershipId,relation:schoolRole==='student'?'student':index===0?'lead_teacher':'teacher'})));
}

async function audit(db,{schoolId,actorUserId,action,entityType,entityId,metadata={}}){await db.insert(auditLogs).values({schoolId,actorUserId:actorUserId||null,action,entityType,entityId,metadata})}
function chunks(items,size){const result=[];for(let i=0;i<items.length;i+=size)result.push(items.slice(i,i+size));return result}
function relationPriority(relation){return relation==='lead_teacher'?3:relation==='teacher'?2:1}
function safeDate(value,fallback){const date=value?new Date(value):fallback;return Number.isNaN(date.getTime())?fallback:date}
function iso(value){if(!value)return null;const date=value instanceof Date?value:new Date(value);return Number.isNaN(date.getTime())?null:date.toISOString()}
