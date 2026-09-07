import 'server-only';
import { database,databaseConfigured,withTransactionDatabase } from '@/db/client';
import { defaultSchoolId } from '@/db/directory';
import { CoreRecoveryError,loadGroupRecoveryAudit,restoreOrphanedDirectoryGroup } from '@/db/recovery';
import { analyzeCoreRecovery } from '@/db/recoveryAnalysis';
import { readJson } from '@/lib/storage';
import { getCoreDirectory,invalidateCoreDirectory } from '@/services/coreDirectory';

export async function getCoreRecoveryAudit(){
  if(!databaseConfigured())throw new CoreRecoveryError('Neon Postgres is not configured',409);
  const [directory,assignments,projects,commits,feedback,assessments,formative,summative,aiReviews,legacyAudit]=await Promise.all([
    getCoreDirectory({fresh:true}),readJson('assignments',[]),readJson('projects',[]),readJson('commits',[]),readJson('feedback',[]),
    readJson('assessments',[]),readJson('formativeAssessments',[]),readJson('summativeAssessments',[]),readJson('aiReviews',[]),readJson('auditLogs',[])
  ]);
  if(directory.source!=='neon')throw new CoreRecoveryError('Recovery requires Neon to be the live directory',409);
  const currentGroupIds=new Set(directory.groups.map(group=>String(group.id)));
  const missingGroupIds=[...new Set(assignments.map(item=>String(item?.groupId||'').trim()).filter(id=>id&&!currentGroupIds.has(id)))];
  const directoryAudit=await loadGroupRecoveryAudit(database(),defaultSchoolId(),missingGroupIds);
  return analyzeCoreRecovery({
    groups:directory.groups,users:directory.users,assignments,projects,commits,feedback,assessments,formative,summative,aiReviews,legacyAudit,directoryAudit
  });
}

export async function restoreCoreGroupFromEvidence({groupId,name},actor){
  const audit=await getCoreRecoveryAudit(),candidate=audit.candidates.find(item=>item.groupId===groupId);
  if(!candidate)throw new CoreRecoveryError('No recoverable missing group was found for this id',404);
  if(candidate.explicitlyDeleted)throw new CoreRecoveryError('This group was explicitly deleted after migration and cannot be restored automatically',409);
  if(!candidate.recoveryReady)throw new CoreRecoveryError('The preserved data is not sufficient for an automatic recovery',409);
  const group=await withTransactionDatabase(db=>restoreOrphanedDirectoryGroup(db,{
    id:candidate.groupId,name,studentIds:candidate.studentIds,teacherIds:candidate.teacherIds,
    assignmentIds:candidate.assignmentIds,projectIds:candidate.projectIds
  },{schoolId:actor.schoolId||defaultSchoolId(),actorUserId:actor.id}));
  invalidateCoreDirectory();
  return {group,evidence:candidate.evidence,latestActivity:candidate.latestActivity};
}
