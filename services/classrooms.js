import 'server-only';
import { and,asc,eq,getTableColumns,inArray,sql } from 'drizzle-orm';
import { database,withTransactionDatabase } from '@/db/client';
import { defaultSchoolId } from '@/db/directory';
import { auditLogs,classrooms,classroomStaff,desks,schoolMemberships,users } from '@/db/schema';
import { classroomSlug,naturalDeskCompare,validateClassroomLayout } from '@/lib/classroomLayout';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ClassroomNotFoundError extends Error{constructor(){super('Classroom not found');this.name='ClassroomNotFoundError'}}
export class ClassroomAccessError extends Error{constructor(){super('You do not have access to this classroom');this.name='ClassroomAccessError'}}
export class ClassroomConflictError extends Error{constructor(){super('This classroom was changed in another window. Reload the latest layout before saving.');this.name='ClassroomConflictError'}}

export async function getClassrooms(user,{includeInactive=true}={}){
  const db=database(),schoolId=schoolFor(user),columns=getTableColumns(classrooms);
  let rows;
  if(isSchoolWide(user)){
    rows=(await db.select({classroom:columns}).from(classrooms).where(and(eq(classrooms.schoolId,schoolId),includeInactive?undefined:eq(classrooms.active,true))).orderBy(asc(classrooms.name))).map(row=>({...row,classroomRole:'manager'}));
  }else{
    if(!user.membershipId)return[];
    rows=await db.select({classroom:columns,classroomRole:classroomStaff.role}).from(classrooms)
      .innerJoin(classroomStaff,and(eq(classroomStaff.classroomId,classrooms.id),eq(classroomStaff.membershipId,user.membershipId)))
      .where(and(eq(classrooms.schoolId,schoolId),includeInactive?undefined:eq(classrooms.active,true))).orderBy(asc(classrooms.name));
  }
  return hydrateClassroomList(db,rows,user);
}

export async function getClassroom(user,classroomId){return readClassroom(database(),user,classroomId)}

export async function getClassroomStaffOptions(user){
  if(!isSchoolWide(user))return[];
  const rows=await database().select({membershipId:schoolMemberships.id,userId:users.id,firstName:users.firstName,lastName:users.lastName,email:users.email})
    .from(schoolMemberships).innerJoin(users,eq(users.id,schoolMemberships.userId))
    .where(and(eq(schoolMemberships.schoolId,schoolFor(user)),eq(schoolMemberships.role,'teacher'),eq(schoolMemberships.status,'active'),eq(users.active,true)))
    .orderBy(asc(users.firstName),asc(users.lastName));
  return rows;
}

export async function createClassroom(user,input){
  assertGlobalManage(user);
  return withTransactionDatabase(db=>db.transaction(async tx=>{
    const schoolId=schoolFor(user),slug=await uniqueClassroomSlug(tx,schoolId,input.name);
    const [created]=await tx.insert(classrooms).values({schoolId,name:input.name,slug,canvasWidth:input.canvasWidth,canvasHeight:input.canvasHeight}).returning();
    const membershipIds=isSchoolWide(user)?await validTeacherMembershipIds(tx,schoolId,input.staffMembershipIds||[]):user.membershipId?[user.membershipId]:[];
    if(membershipIds.length)await tx.insert(classroomStaff).values(membershipIds.map(membershipId=>({classroomId:created.id,membershipId,role:'manager'}))).onConflictDoNothing();
    await audit(tx,user,{action:'classroom.created',classroomId:created.id,metadata:{name:created.name,canvas:{width:created.canvasWidth,height:created.canvasHeight},staffCount:membershipIds.length}});
    return readClassroom(tx,user,created.id);
  }));
}

export async function updateClassroomDetails(user,input){
  assertGlobalManage(user);
  return withTransactionDatabase(db=>db.transaction(async tx=>{
    await requireClassroom(tx,user,input.classroomId,{manage:true});
    const [updated]=await tx.update(classrooms).set({name:input.name,updatedAt:new Date(),version:sql`${classrooms.version}+1`})
      .where(and(eq(classrooms.id,input.classroomId),eq(classrooms.schoolId,schoolFor(user)))).returning({id:classrooms.id});
    if(!updated)throw new ClassroomNotFoundError();
    if(isSchoolWide(user)&&Array.isArray(input.staffMembershipIds)){
      const membershipIds=await validTeacherMembershipIds(tx,schoolFor(user),input.staffMembershipIds);
      await tx.delete(classroomStaff).where(eq(classroomStaff.classroomId,input.classroomId));
      if(membershipIds.length)await tx.insert(classroomStaff).values(membershipIds.map(membershipId=>({classroomId:input.classroomId,membershipId,role:'manager'})));
    }
    await audit(tx,user,{action:'classroom.details_updated',classroomId:input.classroomId,metadata:{name:input.name,staffChanged:isSchoolWide(user)&&Array.isArray(input.staffMembershipIds)}});
    return readClassroom(tx,user,input.classroomId);
  }));
}

export async function saveClassroomLayout(user,input){
  assertGlobalManage(user);
  return withTransactionDatabase(db=>db.transaction(async tx=>{
    const room=await requireClassroom(tx,user,input.classroomId,{manage:true});
    const current=await tx.select().from(desks).where(eq(desks.classroomId,input.classroomId));
    const currentById=new Map(current.map(desk=>[desk.id,desk]));
    const incoming=input.desks.map(desk=>{
      const existing=UUID.test(desk.id)?currentById.get(desk.id):null;
      if(UUID.test(desk.id)&&!existing)throw new ClassroomConflictError();
      return{...desk,code:existing?.code||desk.code,label:String(desk.label||'').trim()||null,x:Number(desk.x),y:Number(desk.y),width:Number(desk.width),height:Number(desk.height)};
    });
    const validation=validateClassroomLayout({canvasWidth:input.canvasWidth,canvasHeight:input.canvasHeight,desks:incoming});
    if(!validation.ok)throw new Error(validation.errors[0]);

    const [updated]=await tx.update(classrooms).set({canvasWidth:input.canvasWidth,canvasHeight:input.canvasHeight,version:sql`${classrooms.version}+1`,updatedAt:new Date()})
      .where(and(eq(classrooms.id,input.classroomId),eq(classrooms.schoolId,schoolFor(user)),eq(classrooms.version,input.version))).returning({id:classrooms.id});
    if(!updated)throw new ClassroomConflictError();

    const keptIds=incoming.filter(desk=>currentById.has(desk.id)).map(desk=>desk.id),removedIds=current.filter(desk=>!keptIds.includes(desk.id)).map(desk=>desk.id);
    if(removedIds.length)await tx.delete(desks).where(and(eq(desks.classroomId,input.classroomId),inArray(desks.id,removedIds)));
    for(const desk of incoming.filter(item=>currentById.has(item.id))){
      await tx.update(desks).set({label:desk.label,x:desk.x,y:desk.y,width:desk.width,height:desk.height,updatedAt:new Date()}).where(and(eq(desks.id,desk.id),eq(desks.classroomId,input.classroomId)));
    }
    const fresh=incoming.filter(desk=>!currentById.has(desk.id));
    if(fresh.length)await tx.insert(desks).values(fresh.map(desk=>({classroomId:input.classroomId,code:desk.code,label:desk.label,x:desk.x,y:desk.y,width:desk.width,height:desk.height})));
    await audit(tx,user,{action:'classroom.layout_saved',classroomId:input.classroomId,metadata:{fromVersion:room.classroom.version,toVersion:room.classroom.version+1,deskCount:incoming.length,created:fresh.length,removed:removedIds.length}});
    return readClassroom(tx,user,input.classroomId);
  }));
}

export async function setClassroomActive(user,{classroomId,active}){
  assertGlobalManage(user);
  return withTransactionDatabase(db=>db.transaction(async tx=>{
    await requireClassroom(tx,user,classroomId,{manage:true});
    const [updated]=await tx.update(classrooms).set({active,version:sql`${classrooms.version}+1`,updatedAt:new Date()}).where(and(eq(classrooms.id,classroomId),eq(classrooms.schoolId,schoolFor(user)))).returning({id:classrooms.id});
    if(!updated)throw new ClassroomNotFoundError();
    await audit(tx,user,{action:active?'classroom.restored':'classroom.archived',classroomId,metadata:{active}});
    return readClassroom(tx,user,classroomId);
  }));
}

export async function getDeskByQrToken(token){
  const rows=await database().select({deskId:desks.id,deskCode:desks.code,deskLabel:desks.label,classroomId:classrooms.id,classroomName:classrooms.name,classroomActive:classrooms.active,schoolId:classrooms.schoolId})
    .from(desks).innerJoin(classrooms,eq(classrooms.id,desks.classroomId)).where(eq(desks.qrToken,token)).limit(1);
  return rows[0]||null;
}

async function hydrateClassroomList(db,rows,user){
  if(!rows.length)return[];
  const ids=rows.map(row=>row.classroom.id),[deskRows,staffRows]=await Promise.all([
    db.select().from(desks).where(inArray(desks.classroomId,ids)).orderBy(asc(desks.createdAt)),
    db.select({classroomId:classroomStaff.classroomId,membershipId:classroomStaff.membershipId,role:classroomStaff.role,userId:users.id,firstName:users.firstName,lastName:users.lastName,email:users.email})
      .from(classroomStaff).innerJoin(schoolMemberships,eq(schoolMemberships.id,classroomStaff.membershipId)).innerJoin(users,eq(users.id,schoolMemberships.userId)).where(inArray(classroomStaff.classroomId,ids))
  ]);
  return rows.map(row=>classroomDto(row.classroom,deskRows.filter(desk=>desk.classroomId===row.classroom.id),staffRows.filter(staff=>staff.classroomId===row.classroom.id),canManageRoom(user,row.classroomRole)));
}

async function readClassroom(db,user,classroomId){
  const access=await requireClassroom(db,user,classroomId);
  const [deskRows,staffRows]=await Promise.all([
    db.select().from(desks).where(eq(desks.classroomId,classroomId)).orderBy(asc(desks.createdAt)),
    db.select({classroomId:classroomStaff.classroomId,membershipId:classroomStaff.membershipId,role:classroomStaff.role,userId:users.id,firstName:users.firstName,lastName:users.lastName,email:users.email})
      .from(classroomStaff).innerJoin(schoolMemberships,eq(schoolMemberships.id,classroomStaff.membershipId)).innerJoin(users,eq(users.id,schoolMemberships.userId)).where(eq(classroomStaff.classroomId,classroomId))
  ]);
  return classroomDto(access.classroom,deskRows,staffRows,canManageRoom(user,access.classroomRole));
}

async function requireClassroom(db,user,classroomId,{manage=false}={}){
  const rows=await db.select().from(classrooms).where(and(eq(classrooms.id,classroomId),eq(classrooms.schoolId,schoolFor(user)))).limit(1);
  const classroom=rows[0];if(!classroom)throw new ClassroomNotFoundError();
  if(isSchoolWide(user))return{classroom,classroomRole:'manager'};
  if(!user.membershipId)throw new ClassroomAccessError();
  const assignments=await db.select({role:classroomStaff.role}).from(classroomStaff).where(and(eq(classroomStaff.classroomId,classroomId),eq(classroomStaff.membershipId,user.membershipId))).limit(1);
  const role=assignments[0]?.role;
  if(!role||manage&&role!=='manager')throw new ClassroomAccessError();
  return{classroom,classroomRole:role};
}

async function validTeacherMembershipIds(db,schoolId,values){
  const unique=[...new Set((values||[]).map(String).filter(Boolean))];if(!unique.length)return[];
  const rows=await db.select({id:schoolMemberships.id}).from(schoolMemberships).where(and(eq(schoolMemberships.schoolId,schoolId),eq(schoolMemberships.role,'teacher'),eq(schoolMemberships.status,'active'),inArray(schoolMemberships.id,unique)));
  if(rows.length!==unique.length)throw new Error('One or more selected teachers are unavailable.');
  return unique;
}

async function uniqueClassroomSlug(db,schoolId,name){
  const base=classroomSlug(name);
  for(let suffix=0;suffix<100;suffix+=1){
    const candidate=(suffix?`${base.slice(0,Math.max(1,116-String(suffix).length))}-${suffix+1}`:base);
    const rows=await db.select({id:classrooms.id}).from(classrooms).where(and(eq(classrooms.schoolId,schoolId),sql`lower(${classrooms.slug})=${candidate.toLowerCase()}`)).limit(1);
    if(!rows.length)return candidate;
  }
  throw new Error('Could not create a unique classroom address.');
}

function classroomDto(classroom,deskRows,staffRows,canManage){
  return{
    id:classroom.id,schoolId:classroom.schoolId,name:classroom.name,slug:classroom.slug,canvasWidth:classroom.canvasWidth,canvasHeight:classroom.canvasHeight,version:classroom.version,active:classroom.active,
    createdAt:iso(classroom.createdAt),updatedAt:iso(classroom.updatedAt),canManage,
    desks:deskRows.map(desk=>({id:desk.id,code:desk.code,label:desk.label||'',x:desk.x,y:desk.y,width:desk.width,height:desk.height,qrToken:desk.qrToken,createdAt:iso(desk.createdAt),updatedAt:iso(desk.updatedAt)})).sort(naturalDeskCompare),
    staff:staffRows.map(staff=>({membershipId:staff.membershipId,userId:staff.userId,firstName:staff.firstName,lastName:staff.lastName,email:staff.email,role:staff.role}))
  };
}

function isSchoolWide(user){return user?.role==='admin'||user?.platformRole==='super_admin'}
function canManageRoom(user,classroomRole){return Boolean(user?.permissionKeys?.includes('classrooms.manage')&&(isSchoolWide(user)||classroomRole==='manager'))}
function assertGlobalManage(user){if(!user?.permissionKeys?.includes('classrooms.manage'))throw new ClassroomAccessError()}
function schoolFor(user){return user?.schoolId||defaultSchoolId()}
function iso(value){return value instanceof Date?value.toISOString():value?new Date(value).toISOString():null}
async function audit(db,user,{action,classroomId,metadata={}}){await db.insert(auditLogs).values({schoolId:schoolFor(user),actorUserId:user.id,action,entityType:'classroom',entityId:classroomId,metadata})}
