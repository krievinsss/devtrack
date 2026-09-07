const EMPTY=[];

export function analyzeCoreRecovery(input={}){
  const groups=array(input.groups),users=array(input.users),assignments=array(input.assignments),projects=array(input.projects);
  const groupIds=new Set(groups.map(item=>text(item?.id)).filter(Boolean));
  const assignmentIds=new Set(assignments.map(item=>text(item?.id)).filter(Boolean));
  const usersById=new Map(users.map(user=>[text(user?.id),safeUser(user)]).filter(([id])=>id));
  const missingGroupIds=[...new Set(assignments.map(item=>text(item?.groupId)).filter(id=>id&&!groupIds.has(id)))];
  const directoryAudit=array(input.directoryAudit),legacyAudit=array(input.legacyAudit);

  const candidates=missingGroupIds.map(groupId=>{
    const linkedAssignments=assignments.filter(item=>text(item?.groupId)===groupId);
    const linkedAssignmentIds=new Set(linkedAssignments.map(item=>text(item?.id)).filter(Boolean));
    const linkedProjects=projects.filter(item=>linkedAssignmentIds.has(text(item?.assignmentId)));
    const linkedProjectIds=new Set(linkedProjects.map(item=>text(item?.id)).filter(Boolean));
    const studentIds=[...new Set(linkedProjects.map(item=>text(item?.studentId)).filter(Boolean))];
    const students=studentIds.map(id=>usersById.get(id)).filter(user=>user?.role==='student');
    const knownStudentIds=new Set(students.map(student=>student.id));
    const missingStudentIds=studentIds.filter(id=>!knownStudentIds.has(id));
    const teacherIds=[...new Set(linkedAssignments.map(item=>text(item?.teacherId)).filter(id=>usersById.has(id)&&usersById.get(id)?.role!=='student'))];
    const commits=array(input.commits).filter(item=>linkedProjectIds.has(text(item?.repositoryId))||linkedProjectIds.has(text(item?.projectId)));
    const feedback=array(input.feedback).filter(item=>linkedProjectIds.has(text(item?.projectId)));
    const finalAssessments=array(input.assessments).filter(item=>linkedProjectIds.has(text(item?.projectId)));
    const aiReviews=array(input.aiReviews).filter(item=>linkedProjectIds.has(text(item?.projectId)));
    const formativeEvents=array(input.formative).filter(item=>linkedAssignmentIds.has(text(item?.assignmentId)));
    const summativeEvents=array(input.summative).filter(item=>linkedAssignmentIds.has(text(item?.assignmentId)));
    const formativeGrades=countResults(formativeEvents,studentIds),summativeGrades=countResults(summativeEvents,studentIds);
    const relevantDirectoryAudit=directoryAudit.filter(item=>text(item?.entityId)===groupId);
    const latestDirectoryAction=latestAuditAction(relevantDirectoryAudit);
    const explicitlyDeleted=latestDirectoryAction?.action==='directory.group_deleted';
    const suggestion=nameSuggestion(groupId,linkedAssignments,relevantDirectoryAudit,legacyAudit);
    const evidenceByProject=new Map(linkedProjects.map(project=>{
      const id=text(project?.id);
      return [id,{
        commits:commits.filter(item=>text(item?.repositoryId)===id||text(item?.projectId)===id).length,
        feedback:feedback.filter(item=>text(item?.projectId)===id).length,
        assessments:finalAssessments.filter(item=>text(item?.projectId)===id).length,
        reviews:aiReviews.filter(item=>text(item?.projectId)===id).length
      }];
    }));
    const projectRows=linkedProjects.map(project=>{
      const student=usersById.get(text(project?.studentId)),evidence=evidenceByProject.get(text(project?.id))||{};
      return {
        id:text(project?.id),name:text(project?.name)||'Untitled project',studentId:text(project?.studentId),
        studentName:student?fullName(student):'Missing account',status:text(project?.status)||'Unknown',
        progress:numberOrNull(project?.progress),repository:repositoryName(project),evidence
      };
    });
    const progressedProjects=projectRows.filter(project=>projectHasProgress(project)).length;
    const activityDates=[
      ...commits.map(item=>item?.timestamp),...feedback.map(item=>item?.createdAt),...finalAssessments.map(item=>item?.updatedAt),
      ...formativeEvents.flatMap(item=>[item?.date,item?.createdAt,...array(item?.results).map(result=>result?.publishedAt)]),
      ...summativeEvents.flatMap(item=>[item?.date,item?.createdAt,...array(item?.results).map(result=>result?.publishedAt)]),
      ...linkedProjects.map(item=>item?.lastSyncedAt),...linkedAssignments.map(item=>item?.updatedAt||item?.createdAt)
    ];

    return {
      groupId,suggestedName:suggestion,explicitlyDeleted,
      latestDirectoryAction:latestDirectoryAction?{action:latestDirectoryAction.action,createdAt:isoOrNull(latestDirectoryAction.createdAt)}:null,
      assignmentIds:[...linkedAssignmentIds],projectIds:[...linkedProjectIds],studentIds:students.map(student=>student.id),teacherIds,
      missingStudentIds,students,
      assignments:linkedAssignments.map(item=>({id:text(item?.id),title:text(item?.title)||'Untitled project',status:text(item?.status)||'Unknown'})),
      projects:projectRows,
      evidence:{
        assignments:linkedAssignments.length,projects:linkedProjects.length,progressedProjects,commits:commits.length,
        feedback:feedback.length,finalGrades:finalAssessments.length,formativeGrades,summativeGrades,aiReviews:aiReviews.length
      },
      latestActivity:latestDate(activityDates),
      confidence:linkedProjects.length&&(progressedProjects||commits.length||feedback.length||finalAssessments.length||formativeGrades||summativeGrades)?'high':linkedAssignments.length?'medium':'low',
      recoveryReady:linkedAssignments.length>0&&students.length>0&&!explicitlyDeleted
    };
  }).sort((a,b)=>new Date(b.latestActivity||0)-new Date(a.latestActivity||0));

  const orphanedProjects=projects.filter(project=>{
    const assignmentId=text(project?.assignmentId);return assignmentId&&!assignmentIds.has(assignmentId);
  }).map(project=>{
    const student=usersById.get(text(project?.studentId));
    return {id:text(project?.id),assignmentId:text(project?.assignmentId),name:text(project?.name)||'Untitled project',studentId:text(project?.studentId),studentName:student?fullName(student):'Missing account',status:text(project?.status)||'Unknown',progress:numberOrNull(project?.progress),repository:repositoryName(project)};
  });

  return {
    scannedAt:new Date().toISOString(),healthyGroups:groups.length,assignments:assignments.length,projects:projects.length,
    candidates,orphanedProjects
  };
}

function safeUser(user){
  return {id:text(user?.id),firstName:text(user?.firstName),lastName:text(user?.lastName),email:text(user?.email),role:text(user?.role)};
}
function fullName(user){return [user.firstName,user.lastName].filter(Boolean).join(' ')||user.email||user.id}
function repositoryName(project){return project?.githubRepo?[text(project.githubOwner),text(project.githubRepo)].filter(Boolean).join('/')||text(project.githubRepo):null}
function projectHasProgress(project){
  const evidence=project.evidence||{},status=project.status.toLowerCase();
  return Number(project.progress||0)>0||Boolean(project.repository)||!['','unknown','not started','nav sākts'].includes(status)||Object.values(evidence).some(Number);
}
function countResults(events,studentIds){const wanted=new Set(studentIds);return events.reduce((sum,event)=>sum+array(event?.results).filter(result=>wanted.has(text(result?.studentId))).length,0)}
function latestAuditAction(items){return [...items].sort((a,b)=>new Date(b?.createdAt||0)-new Date(a?.createdAt||0))[0]||null}
function nameSuggestion(groupId,assignments,directoryAudit,legacyAudit){
  const auditNames=[...directoryAudit,...legacyAudit.filter(item=>text(item?.targetId)===groupId||text(item?.entityId)===groupId)].flatMap(item=>[item?.metadata?.name,item?.groupName,item?.name]);
  const assignmentNames=assignments.flatMap(item=>[item?.groupName,item?.cohortName,item?.className]);
  return [...auditNames,...assignmentNames].map(text).find(Boolean)||'';
}
function latestDate(values){const dates=values.map(value=>new Date(value||0)).filter(date=>!Number.isNaN(date.getTime())&&date.getTime()>0).sort((a,b)=>b-a);return dates[0]?.toISOString()||null}
function isoOrNull(value){const date=new Date(value||0);return Number.isNaN(date.getTime())||date.getTime()<=0?null:date.toISOString()}
function numberOrNull(value){const number=Number(value);return Number.isFinite(number)?number:null}
function array(value){return Array.isArray(value)?value:EMPTY}
function text(value){return value==null?'':String(value).trim()}
