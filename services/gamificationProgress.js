import 'server-only';
import { readJson,readVersionedEvents,updateJson } from '@/lib/storage';
import { ACHIEVEMENTS,levelForXp,levelCreditReward } from '@/services/gamification';

const ACHIEVEMENT_CREDIT_REWARD=100;
const XP_BY_GRADE={10:700,9:550,8:430,7:340,6:270,5:210,4:160,3:110,2:70,1:30};
function emptyProfile(studentId){return {studentId,credits:0,xp:0,level:1,inventory:[],equipped:{avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null},rewards:{},claimedLevels:[1],achievements:[],stats:{},updatedAt:new Date().toISOString()}}
function grantRewards(profile){const inventory=new Set(profile.inventory||[]);for(const id of profile.achievements||[])for(const reward of ACHIEVEMENTS[id]?.rewards||[])inventory.add(reward);return {...profile,inventory:[...inventory]}}
function isPresent(a){return ['present','late','attended','here'].includes(String(a.status||'').toLowerCase())}
function isLate(a){return String(a.status||'').toLowerCase()==='late'||Number(a.lateMinutes||a.minutesLate||0)>0}
function completed(p){return ['done','completed','finished','submitted'].includes(String(p.status||'').toLowerCase())||Number(p.progress||0)>=100}
function assessmentXp(items){return items.reduce((sum,a)=>sum+(XP_BY_GRADE[Math.max(1,Math.min(10,Number(a.grade)||1))]||0),0)}

export async function evaluateGamificationProgress(studentId){
  const [projects,commits,attendance,assessments,transactions,musicEvents]=await Promise.all([readJson('projects',[]),readJson('commits',[]),readJson('attendance',[]),readJson('assessments',[]),readJson('gamificationTransactions',[]),readVersionedEvents('music','classroom')]);
  const studentProjects=projects.filter(p=>p.studentId===studentId);const ids=new Set(studentProjects.map(p=>p.id));
  const studentCommits=commits.filter(c=>ids.has(c.repositoryId));const studentAttendance=attendance.filter(a=>a.studentId===studentId);const studentAssessments=assessments.filter(a=>a.studentId===studentId);
  const rewardedAchievementIds=new Set(transactions.filter(t=>t.studentId===studentId&&t.type==='achievement'&&t.achievementId&&Number(t.credits)>0).map(t=>t.achievementId));
  const count=studentCommits.length,fixes=studentCommits.filter(c=>/\b(fix|fixed|bug|hotfix)\b/i.test(c.message||'')).length,refactors=studentCommits.filter(c=>/\brefactor/i.test(c.message||'')).length;
  const musicMap=new Map();for(const event of musicEvents){if(event.type==='add'&&event.request)musicMap.set(event.request.id,event.request);if(event.type==='patch'&&event.requestId&&musicMap.has(event.requestId))musicMap.set(event.requestId,{...musicMap.get(event.requestId),...(event.patch||{})})}const musicRequests=[...musicMap.values()].filter(x=>x.studentId===studentId),playedSongs=musicRequests.filter(x=>x.status==='played'),recentMusic=musicRequests.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const hours=studentCommits.map(c=>new Date(c.timestamp).getHours()).filter(Number.isFinite);const finished=studentProjects.filter(completed);const present=studentAttendance.filter(isPresent);const noLate=present.filter(a=>!isLate(a));
  const canonicalXp=assessmentXp(studentAssessments),canonicalLevel=levelForXp(canonicalXp);
  let next=null,newIds=[],creditIds=[],newLevels=[],levelBonus=0,xpBefore=0;
  await updateJson('gamificationProfiles',[],profiles=>{let p=profiles.find(x=>x.studentId===studentId)||emptyProfile(studentId);xpBefore=Number(p.xp||0);const set=new Set(p.achievements||[]),before=new Set(set);
    if(count>=1)set.add('first_commit');if(count>=10)set.add('commits_10');if(count>=25)set.add('commits_25');if(count>=50)set.add('commits_50');if(count>=67)set.add('six_seven');if(count>=100)set.add('commits_100');if(count>=250)set.add('commits_250');if(fixes>=10)set.add('bug_hunter');if(refactors>=5)set.add('refactor_enjoyer');if(hours.some(h=>h>=22))set.add('night_coder');if(hours.some(h=>h<7))set.add('early_bird');
    if(musicRequests.length>=1)set.add('music_first_request');if(playedSongs.length>=5)set.add('music_5_played');if(playedSongs.length>=15)set.add('music_15_played');if(playedSongs.length>=30)set.add('music_30_played');if(recentMusic.length>=5&&recentMusic.slice(0,5).every(x=>x.status==='played'))set.add('music_clean_streak');
    if(finished.length>=1)set.add('first_project');if(finished.length>=3)set.add('projects_3');if(finished.length>=5)set.add('projects_5');if(finished.some(pr=>pr.deadline&&new Date(pr.updatedAt||pr.completedAt||Date.now())<=new Date(`${pr.deadline}T23:59:59`)))set.add('deadline_hero');if(studentAssessments.some(a=>Number(a.percent)>=100))set.add('rubric_master');
    if(present.length>=10)set.add('attendance_10');if(present.length>=25)set.add('attendance_25');if(noLate.length>=10&&present.length>=10)set.add('never_late_10');
    const high=studentAssessments.filter(a=>Number(a.grade)>=8).length,tens=studentAssessments.filter(a=>Number(a.grade)===10).length;if(high>=3)set.add('three_high_grades');if(high>=5)set.add('five_high_grades');if(tens>=3)set.add('three_tens');
    if(canonicalLevel>=5)set.add('level_5');if(canonicalLevel>=10)set.add('level_10');if(canonicalLevel>=15)set.add('level_15');if(canonicalLevel>=20)set.add('level_20');if(canonicalLevel>=30)set.add('level_30');if(canonicalLevel>=12&&(p.inventory||[]).length>=10)set.add('sigma_mode');
    newIds=[...set].filter(id=>!before.has(id));creditIds=[...set].filter(id=>ACHIEVEMENTS[id]&&!rewardedAchievementIds.has(id));
    const claimed=new Set(p.claimedLevels||[1]);newLevels=[];for(let lv=2;lv<=canonicalLevel;lv++)if(!claimed.has(lv)){claimed.add(lv);newLevels.push(lv)}levelBonus=newLevels.reduce((sum,lv)=>sum+levelCreditReward(lv),0);
    const achievementCredits=creditIds.length*ACHIEVEMENT_CREDIT_REWARD;
    p=grantRewards({...p,credits:Number(p.credits||0)+achievementCredits+levelBonus,xp:canonicalXp,level:canonicalLevel,claimedLevels:[...claimed].sort((a,b)=>a-b),achievements:[...set],stats:{...(p.stats||{}),commits:count,fixCommits:fixes,refactorCommits:refactors,projectsCompleted:finished.length,attendancePresent:present.length,musicRequests:musicRequests.length,musicPlayed:playedSongs.length,xpCanonicalV1:true},updatedAt:new Date().toISOString()});next=p;return [p,...profiles.filter(x=>x.studentId!==studentId)]});
  const additions=[];
  for(const id of creditIds)additions.push({id:`achievement_${studentId}_${id}`,studentId,type:'achievement',achievementId:id,credits:ACHIEVEMENT_CREDIT_REWARD,xp:0,label:`Achievement unlocked: ${ACHIEVEMENTS[id]?.name||id}`,createdAt:new Date().toISOString()});
  if(newLevels.length)additions.push({id:`level_reconcile_${studentId}_${canonicalLevel}`,studentId,type:'level_reward',levels:newLevels,credits:levelBonus,xp:0,label:newLevels.length===1?`Level ${newLevels[0]} unlock reward`:`Level ${newLevels[0]}–${newLevels[newLevels.length-1]} unlock rewards`,createdAt:new Date().toISOString()});
  if(xpBefore!==canonicalXp)additions.push({id:`xp_reconcile_${studentId}_${Date.now()}`,studentId,type:'xp_reconcile',credits:0,xp:canonicalXp-xpBefore,label:'XP synchronized from assessments',createdAt:new Date().toISOString()});
  if(additions.length)await updateJson('gamificationTransactions',[],items=>[...additions,...items.filter(t=>!additions.some(a=>a.id===t.id))]);
  return {profile:next,newAchievements:newIds,creditedAchievements:creditIds,achievementCredits:creditIds.length*ACHIEVEMENT_CREDIT_REWARD,xp:canonicalXp,level:canonicalLevel,newLevels};
}
