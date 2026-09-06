import 'server-only';
import { readJson,updateJson } from '@/lib/storage';
import { creditsForGrade,normalizeGrade,xpForGrade } from '@/lib/gradeRewards';
import { levelForXp } from '@/services/gamification';

function emptyProfile(studentId){return {studentId,credits:0,xp:0,level:1,inventory:[],equipped:{avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null},rewards:{},claimedLevels:[1],achievements:[],updatedAt:new Date().toISOString()}}

// One reward per logical assessment result. Re-grading adjusts only the difference,
// so saving the same grade twice can never duplicate DevCredits or XP.
export async function rewardGradedAssessment({studentId,sourceId,sourceType,grade,label}){
  const safeGrade=normalizeGrade(grade);
  const credits=creditsForGrade(safeGrade);
  const xp=xpForGrade(safeGrade,sourceType);
  const transactionId=`grade_reward_${sourceType}_${sourceId}_${studentId}`;
  const transactions=await readJson('gamificationTransactions',[]);
  const previous=transactions.find(t=>t.id===transactionId);
  const previousCredits=Number(previous?.credits||0);
  const previousXp=Number(previous?.xp||0);
  const deltaCredits=credits-previousCredits;
  const deltaXp=xp-previousXp;
  const now=new Date().toISOString();

  if(deltaCredits!==0||deltaXp!==0){
    await updateJson('gamificationProfiles',[],profiles=>{
      const current=profiles.find(p=>p.studentId===studentId)||emptyProfile(studentId);
      const nextXp=Math.max(0,Number(current.xp||0)+deltaXp);
      const next={...current,credits:Math.max(0,Number(current.credits||0)+deltaCredits),xp:nextXp,level:levelForXp(nextXp),updatedAt:now};
      return [next,...profiles.filter(p=>p.studentId!==studentId)];
    });
  }

  const transaction={id:transactionId,studentId,type:'grade_reward',sourceType,sourceId,grade:safeGrade,credits,xp,label:label||`${sourceType} grade ${safeGrade}`,createdAt:previous?.createdAt||now,updatedAt:now};
  await updateJson('gamificationTransactions',[],items=>[transaction,...items.filter(t=>t.id!==transactionId)]);
  return {credits,xp,delta:deltaCredits,deltaCredits,deltaXp,grade:safeGrade};
}
