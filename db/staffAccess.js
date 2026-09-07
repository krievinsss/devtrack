import { and,eq,inArray,sql } from 'drizzle-orm';
import { resolveAccess } from './access.js';
import { MODULE_CATALOG,PERMISSION_CATALOG,ROLE_PERMISSION_CATALOG,TEACHER_MODULE_PRESETS } from './catalog.js';
import { auditLogs,groupMemberships,groups,membershipModuleAccess,membershipPermissionOverrides,schoolMemberships,schoolModuleAccess,users } from './schema.js';

export const STAFF_ROLES=['teacher','school_admin'];

export function normalizeStaffAccess({schoolRole='teacher',moduleKeys=[],permissionKeys=[],schoolOverrides=[]}={}){
  if(!STAFF_ROLES.includes(schoolRole))throw new StaffAccessError('Invalid staff role');
  const knownModules=new Set(MODULE_CATALOG.filter(item=>item.active!==false).map(item=>item.key));
  const requestedModules=new Set(moduleKeys.map(String));
  for(const key of requestedModules)if(!knownModules.has(key))throw new StaffAccessError(`Unknown module: ${key}`);
  for(const row of schoolOverrides)if(row.enabled===false)requestedModules.delete(row.moduleKey);
  if(schoolRole==='teacher')requestedModules.delete('administration');

  const membershipOverrides=MODULE_CATALOG.map(module=>({moduleKey:module.key,enabled:requestedModules.has(module.key)}));
  const baseAccess=resolveAccess({schoolRole,membershipOverrides,schoolOverrides});
  const effectiveModules=new Set(baseAccess.moduleKeys);
  const knownPermissions=new Set(PERMISSION_CATALOG.map(item=>item.key));
  const requestedPermissions=new Set(permissionKeys.map(String));
  for(const key of requestedPermissions)if(!knownPermissions.has(key))throw new StaffAccessError(`Unknown permission: ${key}`);

  const desiredPermissions=new Set(PERMISSION_CATALOG.filter(item=>effectiveModules.has(item.moduleKey)&&requestedPermissions.has(item.key)).map(item=>item.key));
  const basePermissions=new Set(baseAccess.permissionKeys);
  const permissionOverrides=[];
  for(const permission of PERMISSION_CATALOG){
    if(!effectiveModules.has(permission.moduleKey))continue;
    const desired=desiredPermissions.has(permission.key),base=basePermissions.has(permission.key);
    if(desired!==base)permissionOverrides.push({permissionKey:permission.key,effect:desired?'allow':'deny'});
  }

  return {
    moduleAccess:MODULE_CATALOG.map(module=>({moduleKey:module.key,enabled:requestedModules.has(module.key)})),
    moduleKeys:[...effectiveModules],
    permissionKeys:[...desiredPermissions],
    permissionOverrides
  };
}

export function staffAccessCatalog(schoolOverrides=[]){
  const disabled=new Set(schoolOverrides.filter(row=>row.enabled===false).map(row=>row.moduleKey));
  return {
    modules:MODULE_CATALOG.filter(item=>item.active!==false).sort((a,b)=>a.sortOrder-b.sortOrder).map(module=>({
      ...module,
      schoolEnabled:!disabled.has(module.key),
      permissions:PERMISSION_CATALOG.filter(permission=>permission.moduleKey===module.key)
    })),
    roleDefaults:ROLE_PERMISSION_CATALOG,
    presets:TEACHER_MODULE_PRESETS
  };
}

export async function loadStaffAccess(db,schoolId){
  const [memberRows,groupRows,schoolOverrides]=await Promise.all([
    db.select({
      membershipId:schoolMemberships.id,membershipStatus:schoolMemberships.status,schoolRole:schoolMemberships.role,
      userId:users.id,email:users.email,firstName:users.firstName,lastName:users.lastName,
      platformRole:users.platformRole,userActive:users.active,mustChangePassword:users.mustChangePassword,
      passwordHash:users.passwordHash,createdAt:users.createdAt,updatedAt:users.updatedAt
    }).from(schoolMemberships).innerJoin(users,eq(users.id,schoolMemberships.userId))
      .where(and(eq(schoolMemberships.schoolId,schoolId),inArray(schoolMemberships.role,STAFF_ROLES))),
    db.select({id:groups.id,name:groups.name,active:groups.active}).from(groups).where(eq(groups.schoolId,schoolId)),
    db.select({moduleKey:schoolModuleAccess.moduleKey,enabled:schoolModuleAccess.enabled}).from(schoolModuleAccess).where(eq(schoolModuleAccess.schoolId,schoolId))
  ]);
  const membershipIds=memberRows.map(row=>row.membershipId);
  const [moduleRows,permissionRows,relationRows]=membershipIds.length?await Promise.all([
    db.select({membershipId:membershipModuleAccess.membershipId,moduleKey:membershipModuleAccess.moduleKey,enabled:membershipModuleAccess.enabled}).from(membershipModuleAccess).where(inArray(membershipModuleAccess.membershipId,membershipIds)),
    db.select({membershipId:membershipPermissionOverrides.membershipId,permissionKey:membershipPermissionOverrides.permissionKey,effect:membershipPermissionOverrides.effect}).from(membershipPermissionOverrides).where(inArray(membershipPermissionOverrides.membershipId,membershipIds)),
    db.select({membershipId:groupMemberships.membershipId,groupId:groupMemberships.groupId,relation:groupMemberships.relation}).from(groupMemberships).where(inArray(groupMemberships.membershipId,membershipIds))
  ]):[[],[],[]];

  const byMembership=(rows,key)=>rows.reduce((map,row)=>{const id=String(row.membershipId);if(!map.has(id))map.set(id,[]);map.get(id).push(key?{[key]:row[key],...(key==='moduleKey'?{enabled:row.enabled}:{effect:row.effect})}:row);return map},new Map());
  const modulesByMembership=byMembership(moduleRows,'moduleKey');
  const permissionsByMembership=byMembership(permissionRows,'permissionKey');
  const groupsByMembership=relationRows.reduce((map,row)=>{const id=String(row.membershipId);if(!map.has(id))map.set(id,[]);map.get(id).push(row.groupId);return map},new Map());

  const staff=memberRows.map(row=>{
    const membershipId=String(row.membershipId),access=resolveAccess({
      platformRole:row.platformRole,schoolRole:row.schoolRole,schoolOverrides,
      membershipOverrides:modulesByMembership.get(membershipId)||[],permissionOverrides:permissionsByMembership.get(membershipId)||[]
    });
    return {
      id:row.userId,membershipId,email:row.email,firstName:row.firstName,lastName:row.lastName,
      platformRole:row.platformRole,schoolRole:row.schoolRole,role:row.schoolRole==='school_admin'?'admin':'teacher',
      active:row.userActive&&row.membershipStatus==='active',platformActive:row.userActive,membershipStatus:row.membershipStatus,
      mustChangePassword:row.mustChangePassword,hasPassword:Boolean(row.passwordHash),groupIds:groupsByMembership.get(membershipId)||[],
      moduleKeys:access.moduleKeys,permissionKeys:access.permissionKeys,createdAt:iso(row.createdAt),updatedAt:iso(row.updatedAt)
    };
  }).sort((a,b)=>Number(b.platformRole==='super_admin')-Number(a.platformRole==='super_admin')||a.lastName.localeCompare(b.lastName,'lv'));

  return {
    staff,
    groups:groupRows.filter(group=>group.active!==false).sort((a,b)=>a.name.localeCompare(b.name,'lv')),
    catalog:staffAccessCatalog(schoolOverrides)
  };
}

export async function createStaffMember(db,input,{schoolId,actorUserId,actorPlatformRole}){
  return db.transaction(async tx=>{
    if(input.schoolRole==='school_admin'&&actorPlatformRole!=='super_admin')throw new StaffAccessError('Only a superadmin can create school administrators',403);
    await assertGroups(tx,input.groupIds,schoolId);
    const duplicate=await tx.select({id:users.id}).from(users).where(sql`lower(${users.email}) = ${input.email.toLowerCase()}`).limit(1);
    if(duplicate.length)throw new StaffAccessError('Šāds e-pasts jau ir reģistrēts',409);
    const schoolOverrides=await tx.select({moduleKey:schoolModuleAccess.moduleKey,enabled:schoolModuleAccess.enabled}).from(schoolModuleAccess).where(eq(schoolModuleAccess.schoolId,schoolId));
    const access=normalizeStaffAccess({...input,schoolOverrides});
    const now=new Date();
    await tx.insert(users).values({
      id:input.id,email:input.email.toLowerCase(),firstName:input.firstName,lastName:input.lastName,
      passwordHash:input.passwordHash,platformRole:'user',active:true,mustChangePassword:true,profile:{},createdAt:now,updatedAt:now
    });
    const [membership]=await tx.insert(schoolMemberships).values({
      schoolId,userId:input.id,role:input.schoolRole,status:input.active===false?'suspended':'active',isPrimary:true,
      joinedAt:now,createdAt:now,updatedAt:now
    }).returning({id:schoolMemberships.id});
    await replaceStaffGroups(tx,membership.id,input.groupIds,input.schoolRole);
    await replaceModuleAccess(tx,membership.id,access.moduleAccess,actorUserId);
    await replacePermissionOverrides(tx,membership.id,access.permissionOverrides,actorUserId);
    await writeAudit(tx,{schoolId,actorUserId,action:'administration.staff_created',entityId:input.id,metadata:{role:input.schoolRole,groupIds:input.groupIds,moduleKeys:access.moduleKeys}});
    return input.id;
  });
}

export async function updateStaffMember(db,input,{schoolId,actorUserId,actorPlatformRole}){
  return db.transaction(async tx=>{
    const target=await staffTarget(tx,input.id,schoolId);
    assertManageable(target,{actorUserId,actorPlatformRole,nextRole:input.schoolRole});
    await assertGroups(tx,input.groupIds,schoolId);
    const duplicate=await tx.select({id:users.id}).from(users).where(and(sql`lower(${users.email}) = ${input.email.toLowerCase()}`,sql`${users.id} <> ${input.id}`)).limit(1);
    if(duplicate.length)throw new StaffAccessError('Šāds e-pasts jau ir reģistrēts',409);
    const schoolOverrides=await tx.select({moduleKey:schoolModuleAccess.moduleKey,enabled:schoolModuleAccess.enabled}).from(schoolModuleAccess).where(eq(schoolModuleAccess.schoolId,schoolId));
    const access=normalizeStaffAccess({...input,schoolOverrides});
    const now=new Date();
    await tx.update(users).set({email:input.email.toLowerCase(),firstName:input.firstName,lastName:input.lastName,updatedAt:now}).where(eq(users.id,input.id));
    await tx.update(schoolMemberships).set({role:input.schoolRole,status:input.active?'active':'suspended',updatedAt:now}).where(eq(schoolMemberships.id,target.membershipId));
    await replaceStaffGroups(tx,target.membershipId,input.groupIds,input.schoolRole);
    await replaceModuleAccess(tx,target.membershipId,access.moduleAccess,actorUserId);
    await replacePermissionOverrides(tx,target.membershipId,access.permissionOverrides,actorUserId);
    await writeAudit(tx,{schoolId,actorUserId,action:'administration.staff_updated',entityId:input.id,metadata:{role:input.schoolRole,active:input.active,groupIds:input.groupIds,moduleKeys:access.moduleKeys,permissionKeys:access.permissionKeys}});
    return input.id;
  });
}

export async function resetStaffPassword(db,{id,passwordHash},{schoolId,actorUserId,actorPlatformRole}){
  return db.transaction(async tx=>{
    const target=await staffTarget(tx,id,schoolId);
    assertManageable(target,{actorUserId,actorPlatformRole,nextRole:target.schoolRole});
    await tx.update(users).set({passwordHash,mustChangePassword:true,updatedAt:new Date()}).where(eq(users.id,id));
    await writeAudit(tx,{schoolId,actorUserId,action:'administration.staff_password_reset',entityId:id});
    return id;
  });
}

async function staffTarget(db,userId,schoolId){
  const rows=await db.select({userId:users.id,membershipId:schoolMemberships.id,schoolRole:schoolMemberships.role,platformRole:users.platformRole}).from(schoolMemberships)
    .innerJoin(users,eq(users.id,schoolMemberships.userId)).where(and(eq(schoolMemberships.schoolId,schoolId),eq(schoolMemberships.userId,userId),inArray(schoolMemberships.role,STAFF_ROLES))).limit(1);
  if(!rows.length)throw new StaffAccessError('Teacher account not found',404);
  return rows[0];
}

function assertManageable(target,{actorUserId,actorPlatformRole,nextRole}){
  if(target.platformRole==='super_admin'||target.userId===actorUserId)throw new StaffAccessError('Superadmin access cannot be changed from this panel',403);
  if(actorPlatformRole!=='super_admin'&&(target.schoolRole==='school_admin'||nextRole==='school_admin'))throw new StaffAccessError('Only a superadmin can manage school administrators',403);
}

async function assertGroups(db,groupIds,schoolId){
  const unique=[...new Set((groupIds||[]).map(String))];
  if(!unique.length)return;
  const rows=await db.select({id:groups.id}).from(groups).where(and(eq(groups.schoolId,schoolId),inArray(groups.id,unique)));
  if(rows.length!==unique.length)throw new StaffAccessError('One or more groups were not found');
}

async function replaceStaffGroups(db,membershipId,groupIds,schoolRole){
  const unique=[...new Set((groupIds||[]).map(String))];
  await db.delete(groupMemberships).where(eq(groupMemberships.membershipId,membershipId));
  if(unique.length)await db.insert(groupMemberships).values(unique.map((groupId,index)=>({groupId,membershipId,relation:schoolRole==='teacher'&&index===0?'lead_teacher':'teacher'})));
}

async function replaceModuleAccess(db,membershipId,moduleAccess,actorUserId){
  await db.delete(membershipModuleAccess).where(eq(membershipModuleAccess.membershipId,membershipId));
  if(moduleAccess.length)await db.insert(membershipModuleAccess).values(moduleAccess.map(row=>({...row,membershipId,configuredByUserId:actorUserId})));
}

async function replacePermissionOverrides(db,membershipId,overrides,actorUserId){
  await db.delete(membershipPermissionOverrides).where(eq(membershipPermissionOverrides.membershipId,membershipId));
  if(overrides.length)await db.insert(membershipPermissionOverrides).values(overrides.map(row=>({...row,membershipId,configuredByUserId:actorUserId})));
}

async function writeAudit(db,{schoolId,actorUserId,action,entityId,metadata={}}){
  await db.insert(auditLogs).values({schoolId,actorUserId,action,entityType:'user',entityId,metadata});
}

function iso(value){return value?new Date(value).toISOString():null}

export class StaffAccessError extends Error{
  constructor(message,status=400){super(message);this.name='StaffAccessError';this.status=status}
}
