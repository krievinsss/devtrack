import { and,eq,inArray,sql } from 'drizzle-orm';
import { MODULE_CATALOG,STUDENT_MODULE_PRESETS,TEACHER_MODULE_PRESETS } from './catalog.js';
import { auditLogs,groupMemberships,groups,membershipModuleAccess,schoolMemberships,schoolModuleAccess,schools,users } from './schema.js';
import { seedAccessCatalog } from './seed.js';

const USER_CORE_KEYS=new Set(['id','email','firstName','lastName','passwordHash','platformRole','role','active','mustChangePassword','groupIds','createdAt','updatedAt']);
const GROUP_CORE_KEYS=new Set(['id','name','academicYear','active','studentIds','teacherIds','createdAt','updatedAt']);

export class LegacyImportError extends Error{constructor(message){super(message);this.name='LegacyImportError'}}

export function prepareLegacyCore({legacyUsers=[],legacyGroups=[],school,ownerEmail}){
  if(!Array.isArray(legacyUsers)||!Array.isArray(legacyGroups))throw new LegacyImportError('Legacy users and groups must be arrays');
  if(!legacyUsers.length)throw new LegacyImportError('No existing users were found to import');

  const now=new Date(),normalizedOwner=normalizeEmail(ownerEmail),userIds=new Set(),emails=new Set();
  const schoolRow={
    id:requiredText(school?.id,'School id'),
    name:requiredText(school?.name,'School name'),
    slug:requiredText(school?.slug,'School slug').toLowerCase(),
    timezone:String(school?.timezone||'Europe/Riga'),
    active:true,
    settings:{legacyImportSource:'devtrack-json'},
    createdAt:now,
    updatedAt:now
  };

  const userRows=legacyUsers.map(raw=>{
    const id=requiredText(raw?.id,'User id'),email=normalizeEmail(raw?.email);
    if(!email)throw new LegacyImportError(`User ${id} has no valid email`);
    if(userIds.has(id))throw new LegacyImportError(`Duplicate user id: ${id}`);
    if(emails.has(email))throw new LegacyImportError(`Duplicate user email: ${email}`);
    userIds.add(id);emails.add(email);
    const isOwner=email===normalizedOwner,createdAt=safeDate(raw.createdAt,now),updatedAt=safeDate(raw.updatedAt,createdAt);
    return {
      id,email,
      firstName:String(raw.firstName||'').trim()||'Unknown',
      lastName:String(raw.lastName||'').trim()||'User',
      passwordHash:raw.passwordHash||null,
      platformRole:isOwner?'super_admin':'user',
      active:raw.active!==false,
      mustChangePassword:Boolean(raw.mustChangePassword),
      profile:legacyProfile(raw),
      createdAt,updatedAt
    };
  });

  if(normalizedOwner&&!userRows.some(row=>row.email===normalizedOwner))throw new LegacyImportError(`The configured owner ${normalizedOwner} was not found in existing users`);

  const legacyById=new Map(legacyUsers.map(user=>[String(user.id),user]));
  const membershipRows=userRows.map(row=>{
    const raw=legacyById.get(row.id)||{},isOwner=row.email===normalizedOwner;
    return {schoolId:schoolRow.id,userId:row.id,role:isOwner?'school_admin':schoolRoleFor(raw.role),status:row.active?'active':'suspended',isPrimary:true,joinedAt:row.createdAt,createdAt:row.createdAt,updatedAt:row.updatedAt};
  });

  const groupIds=new Set();
  const groupRows=legacyGroups.map(raw=>{
    const id=requiredText(raw?.id,'Group id');
    if(groupIds.has(id))throw new LegacyImportError(`Duplicate group id: ${id}`);
    groupIds.add(id);
    const createdAt=safeDate(raw.createdAt,now),updatedAt=safeDate(raw.updatedAt,createdAt);
    return {id,schoolId:schoolRow.id,name:requiredText(raw?.name,'Group name'),academicYear:raw.academicYear?String(raw.academicYear):null,active:raw.active!==false,externalRefs:legacyGroupRefs(raw),createdAt,updatedAt};
  });

  const relations=new Map();
  const putRelation=(groupId,userId,relation)=>{
    if(!groupIds.has(groupId)||!userIds.has(userId))return;
    const key=`${groupId}:${userId}`,current=relations.get(key);
    if(!current||relationPriority(relation)>relationPriority(current.relation))relations.set(key,{groupId,userId,relation});
  };
  for(const raw of legacyGroups){
    const groupId=String(raw.id);
    for(const userId of raw.studentIds||[])putRelation(groupId,String(userId),'student');
    for(const [index,userId] of (raw.teacherIds||[]).entries())putRelation(groupId,String(userId),index===0?'lead_teacher':'teacher');
  }
  for(const raw of legacyUsers){
    const role=schoolRoleFor(raw.role),relation=role==='student'?'student':'teacher';
    for(const groupId of raw.groupIds||[])putRelation(String(groupId),String(raw.id),relation);
  }

  return {school:schoolRow,userRows,membershipRows,groupRows,relationSeeds:[...relations.values()]};
}

export async function importLegacyCore(db,input){
  const prepared=prepareLegacyCore(input),now=new Date();
  await seedAccessCatalog(db);
  await db.insert(schools).values(prepared.school).onConflictDoUpdate({target:schools.id,set:{name:prepared.school.name,slug:prepared.school.slug,timezone:prepared.school.timezone,active:true,updatedAt:now}});

  await db.insert(users).values(prepared.userRows).onConflictDoUpdate({target:users.id,set:{
    email:excluded(users.email),firstName:excluded(users.firstName),lastName:excluded(users.lastName),passwordHash:excluded(users.passwordHash),platformRole:excluded(users.platformRole),active:excluded(users.active),mustChangePassword:excluded(users.mustChangePassword),profile:excluded(users.profile),updatedAt:excluded(users.updatedAt)
  }});
  await db.insert(schoolMemberships).values(prepared.membershipRows).onConflictDoUpdate({target:[schoolMemberships.schoolId,schoolMemberships.userId],set:{role:excluded(schoolMemberships.role),status:excluded(schoolMemberships.status),isPrimary:true,updatedAt:now}});

  if(prepared.groupRows.length){
    await db.insert(groups).values(prepared.groupRows).onConflictDoUpdate({target:groups.id,set:{schoolId:excluded(groups.schoolId),name:excluded(groups.name),academicYear:excluded(groups.academicYear),active:excluded(groups.active),externalRefs:excluded(groups.externalRefs),updatedAt:excluded(groups.updatedAt)}});
  }

  const importedMemberships=await db.select({id:schoolMemberships.id,userId:schoolMemberships.userId,role:schoolMemberships.role}).from(schoolMemberships).where(and(eq(schoolMemberships.schoolId,prepared.school.id),inArray(schoolMemberships.userId,prepared.userRows.map(row=>row.id))));
  const membershipByUser=new Map(importedMemberships.map(row=>[row.userId,row]));
  const relationRows=prepared.relationSeeds.map(seed=>({groupId:seed.groupId,membershipId:membershipByUser.get(seed.userId)?.id,relation:seed.relation})).filter(row=>row.membershipId);
  if(relationRows.length)await db.insert(groupMemberships).values(relationRows).onConflictDoUpdate({target:[groupMemberships.groupId,groupMemberships.membershipId],set:{relation:excluded(groupMemberships.relation)}});

  const schoolModules=MODULE_CATALOG.map(module=>({schoolId:prepared.school.id,moduleKey:module.key,enabled:true,configuredByUserId:input.actorUserId||null}));
  await db.insert(schoolModuleAccess).values(schoolModules).onConflictDoNothing();

  const moduleRows=[];
  for(const membership of importedMemberships){
    const user=prepared.userRows.find(row=>row.id===membership.userId);
    const keys=user?.platformRole==='super_admin'?MODULE_CATALOG.map(module=>module.key):membership.role==='student'?STUDENT_MODULE_PRESETS.programming:membership.role==='teacher'?TEACHER_MODULE_PRESETS.programming:MODULE_CATALOG.map(module=>module.key);
    for(const moduleKey of keys)moduleRows.push({membershipId:membership.id,moduleKey,enabled:true,configuredByUserId:input.actorUserId||null});
  }
  if(moduleRows.length)await db.insert(membershipModuleAccess).values(moduleRows).onConflictDoNothing();

  const report={users:prepared.userRows.length,memberships:importedMemberships.length,groups:prepared.groupRows.length,groupRelations:relationRows.length,schoolId:prepared.school.id};
  await db.insert(auditLogs).values({schoolId:prepared.school.id,actorUserId:input.actorUserId||null,action:'legacy.core_imported',entityType:'school',entityId:prepared.school.id,metadata:{source:'devtrack-json',...report}});
  return report;
}

function excluded(column){return sql.raw(`excluded."${String(column.name).replaceAll('"','""')}"`)}
function normalizeEmail(value){return String(value||'').trim().toLowerCase()}
function requiredText(value,label){const text=String(value||'').trim();if(!text)throw new LegacyImportError(`${label} is required`);return text}
function safeDate(value,fallback){const date=value?new Date(value):fallback;return Number.isNaN(date.getTime())?fallback:date}
function schoolRoleFor(role){return ['admin','school_admin'].includes(role)?'school_admin':role==='teacher'?'teacher':'student'}
function relationPriority(relation){return relation==='lead_teacher'?3:relation==='teacher'?2:1}
function legacyProfile(raw){const profile={legacyRole:raw.role||'student'};for(const [key,value] of Object.entries(raw||{}))if(!USER_CORE_KEYS.has(key)&&value!==undefined)profile[key]=value;return profile}
function legacyGroupRefs(raw){const refs={};for(const [key,value] of Object.entries(raw||{}))if(!GROUP_CORE_KEYS.has(key)&&value!==undefined)refs[key]=value;return refs}
