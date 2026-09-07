import { and,desc,eq,inArray,sql } from 'drizzle-orm';
import { auditLogs,groupMemberships,groups,schoolMemberships } from './schema.js';

export async function loadGroupRecoveryAudit(db,schoolId,groupIds=[]){
  const ids=[...new Set(groupIds.map(String).filter(Boolean))];if(!ids.length)return [];
  return db.select({action:auditLogs.action,entityId:auditLogs.entityId,metadata:auditLogs.metadata,createdAt:auditLogs.createdAt})
    .from(auditLogs).where(and(eq(auditLogs.schoolId,schoolId),eq(auditLogs.entityType,'group'),inArray(auditLogs.entityId,ids))).orderBy(desc(auditLogs.createdAt));
}

export async function restoreOrphanedDirectoryGroup(db,input,{schoolId,actorUserId}={}){
  return db.transaction(async tx=>{
    const id=String(input.id||'').trim(),name=String(input.name||'').trim();
    if(!id||!name)throw new CoreRecoveryError('Group id and name are required');
    const existing=await tx.select({id:groups.id,schoolId:groups.schoolId,name:groups.name}).from(groups).where(eq(groups.id,id)).limit(1);
    if(existing.length)throw new CoreRecoveryError(existing[0].schoolId===schoolId?'This group has already been restored':'This group id belongs to another school',409);
    const duplicateName=await tx.select({id:groups.id}).from(groups).where(and(eq(groups.schoolId,schoolId),sql`lower(${groups.name}) = ${name.toLowerCase()}`)).limit(1);
    if(duplicateName.length)throw new CoreRecoveryError('A group with this name already exists',409);

    const requestedStudents=[...new Set((input.studentIds||[]).map(String).filter(Boolean))];
    const requestedTeachers=[...new Set([...(input.teacherIds||[]),actorUserId].map(String).filter(Boolean))];
    const requestedUsers=[...new Set([...requestedStudents,...requestedTeachers])];
    const memberships=requestedUsers.length?await tx.select({id:schoolMemberships.id,userId:schoolMemberships.userId,role:schoolMemberships.role,status:schoolMemberships.status})
      .from(schoolMemberships).where(and(eq(schoolMemberships.schoolId,schoolId),inArray(schoolMemberships.userId,requestedUsers))):[];
    const byUser=new Map(memberships.map(item=>[item.userId,item]));
    const studentMemberships=requestedStudents.map(userId=>byUser.get(userId)).filter(item=>item?.role==='student');
    const teacherMemberships=requestedTeachers.map(userId=>byUser.get(userId)).filter(item=>item&&item.role!=='student');
    if(!studentMemberships.length)throw new CoreRecoveryError('No existing student accounts could be linked to this recovered group',409);
    if(!teacherMemberships.length)throw new CoreRecoveryError('No teacher account could be linked to this recovered group',409);

    const now=new Date();
    await tx.insert(groups).values({
      id,schoolId,name,active:true,academicYear:null,
      externalRefs:{recovery:{source:'orphaned-project-audit',recoveredAt:now.toISOString()}},createdAt:now,updatedAt:now
    });
    const relations=[
      ...studentMemberships.map(item=>({groupId:id,membershipId:item.id,relation:'student'})),
      ...teacherMemberships.map((item,index)=>({groupId:id,membershipId:item.id,relation:index===0?'lead_teacher':'teacher'}))
    ];
    await tx.insert(groupMemberships).values(relations);
    const metadata={
      source:'orphaned-project-audit',name,
      studentIds:studentMemberships.map(item=>item.userId),teacherIds:teacherMemberships.map(item=>item.userId),
      assignmentIds:(input.assignmentIds||[]).slice(0,100),projectIds:(input.projectIds||[]).slice(0,500),
      missingStudentIds:requestedStudents.filter(id=>!studentMemberships.some(item=>item.userId===id))
    };
    await tx.insert(auditLogs).values({schoolId,actorUserId,action:'directory.group_recovered',entityType:'group',entityId:id,metadata});
    return {id,name,studentIds:metadata.studentIds,teacherIds:metadata.teacherIds,missingStudentIds:metadata.missingStudentIds};
  });
}

export class CoreRecoveryError extends Error{
  constructor(message,status=400){super(message);this.name='CoreRecoveryError';this.status=status}
}
