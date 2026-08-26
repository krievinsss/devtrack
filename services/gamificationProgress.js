import 'server-only';
import { readJson,updateJson } from '@/lib/storage';
import { ACHIEVEMENTS,levelForXp } from '@/services/gamification';

const ACHIEVEMENT_CREDIT_REWARD=100;
function emptyProfile(studentId){return {studentId,credits:0,xp:0,level:1,inventory:[],equipped:{avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null},rewards:{},claimedLevels:[1],achievements:[],stats:{},updatedAt:new Date().toISOString()}}
function grantRewards(profile){const inventory=new Set(profile.inventory||[]);for(const id of profile.achievements||[])for(const reward of ACHIEVEMENTS[id]?.rewards||[])inventory.add(reward);return {...profile,inventory:[...inventory]}}
function isPresent(a){return ['present','late','attended','here'].includes(String(a.status||'').toLowerCase())}
function isLate(a){return String(a.status||'').toLowerCase()==='late'||Number(a.lateMinutes||a.minutesLate||0)>0}
function completed(p){return ['done','completed','finished','submitted'].includes(String(p.status||'').toLowerCase())||Number(p.progress||0)>=100}

export async function evaluateGamificationProgress(studentId){
  const [projects,commits,attendance,assessments,transactions]=await Promise.all([readJson('projects',[]),readJson('commits',[]),readJson('attendance',[]),readJson('assessments',[]),readJson('gamificationTransactions',[])]);
  const studentProjects=projects.filter(p=>p.studentId===studentId);const ids=new Set(studentProjects.map(p=>p.id));
  const studentCommits=commits.filter(c=>ids.has(c.repositoryId));const studentAttendance=attendance.filter(a=>a.studentId===studentId);const studentAssessments=assessments.filter(a=>a.studentId===studentId);
  const rewardedAchievementIds=new Set(transactions.filter(t=>t.studentId===studentId&&t.type==='achievement'&&t.achievementId&&Number(t.credits)>0).map(t=>t.achievementId));
  const count=studentCommits.length,fixes=studentCommits.filter(c=>/\b(fix|fixed|bug|hotfix)\b/i.test(c.message||'')).length,refactors=studentCommits.filter(c=>/\brefactor/i.test(c.message||'')).length;
  const hours=studentCommits.map(c=>new Date(c.timestamp).getHours()).filter(Number.isFinite);const finished=studentProjects.filter(completed);const present=studentAttendance.filter(isPresent);const noLate=present.filter(a=>!isLate(a));
  let next=null,newIds=[],creditIds=[];
  await updateJson('gamificationProfiles',[],profiles=>{let p=profiles.find(x=>x.studentId===studentId)||emptyProfile(studentId);const set=new Set(p.achievements||[]),before=new Set(set);
    if(count>=1)set.add('first_commit');if(count>=10)set.add('commits_10');if(count>=25)set.add('commits_25');if(count>=50)set.add('commits_50');if(count>=67)set.add('six_seven');if(count>=100)set.add('commits_100');if(count>=250)set.add('commits_250');if(fixes>=10)set.add('bug_hunter');if(refactors>=5)set.add('refactor_enjoyer');if(hours.some(h=>h>=22))set.add('night_coder');if(hours.some(h=>h<7))set.add('early_bird');
    if(finished.length>=1)set.add('first_project');if(finished.length>=3)set.add('projects_3');if(finished.length>=5)set.add('projects_5');if(finished.some(pr=>pr.deadline&&new Date(pr.updatedAt||pr.completedAt||Date.now())<=new Date(`${pr.deadline}T23:59:59`)))set.add('deadline_hero');if(studentAssessments.some(a=>Number(a.percent)>=100))set.add('rubric_master');
    if(present.length>=10)set.add('attendance_10');if(present.length>=25)set.add('attendance_25');if(noLate.length>=10&&present.length>=10)set.add('never_late_10');
    const high=studentAssessments.filter(a=>Number(a.grade)>=8).length,tens=studentAssessments.filter(a=>Number(a.grade)===10).length;if(high>=3)set.add('three_high_grades');if(high>=5)set.add('five_high_grades');if(tens>=3)set.add('three_tens');
    const level=p.level||levelForXp(p.xp||0);if(level>=12&&(p.inventory||[]).length>=10)set.add('sigma_mode');
    newIds=[...set].filter(id=>!before.has(id));
    creditIds=[...set].filter(id=>ACHIEVEMENTS[id]&&!rewardedAchievementIds.has(id));
    const achievementCredits=creditIds.length*ACHIEVEMENT_CREDIT_REWARD;
    p=grantRewards({...p,credits:Number(p.credits||0)+achievementCredits,achievements:[...set],stats:{...(p.stats||{}),commits:count,fixCommits:fixes,refactorCommits:refactors,projectsCompleted:finished.length,attendancePresent:present.length},updatedAt:new Date().toISOString()});next=p;return [p,...profiles.filter(x=>x.studentId!==studentId)]});
  if(creditIds.length)await updateJson('gamificationTransactions',[],items=>[...creditIds.map(id=>({id:`achievement_${studentId}_${id}`,studentId,type:'achievement',achievementId:id,credits:ACHIEVEMENT_CREDIT_REWARD,xp:0,label:`Achievement unlocked: ${ACHIEVEMENTS[id]?.name||id}`,createdAt:new Date().toISOString()})),...items.filter(t=>!creditIds.some(id=>t.id===`achievement_${studentId}_${id}`))]);
  return {profile:next,newAchievements:newIds,creditedAchievements:creditIds,achievementCredits:creditIds.length*ACHIEVEMENT_CREDIT_REWARD};
}
