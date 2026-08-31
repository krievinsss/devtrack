import 'server-only';
import { readJson,updateJson } from '@/lib/storage';

const CREDIT_BY_GRADE={10:500,9:350,8:250,7:175,6:120,5:80,4:50,3:25,2:10,1:0};
function emptyProfile(studentId){return {studentId,credits:0,xp:0,level:1,inventory:[],equipped:{avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null},rewards:{},claimedLevels:[1],achievements:[],updatedAt:new Date().toISOString()}}

// One reward per logical assessment result. Re-grading adjusts only the difference,
// so saving the same grade twice can never duplicate DevCredits.
export async function rewardGradedAssessment({studentId,sourceId,sourceType,grade,label}){
  const safeGrade=Math.max(1,Math.min(10,Number(grade)||1));
  const credits=CREDIT_BY_GRADE[safeGrade]||0;
  const transactionId=`grade_reward_${sourceType}_${sourceId}_${studentId}`;
  const transactions=await readJson('gamificationTransactions',[]);
  const previous=transactions.find(t=>t.id===transactionId);
  const previousCredits=Number(previous?.credits||0);
  const delta=credits-previousCredits;
  const now=new Date().toISOString();

  if(delta!==0){
    await updateJson('gamificationProfiles',[],profiles=>{
      const current=profiles.find(p=>p.studentId===studentId)||emptyProfile(studentId);
      const next={...current,credits:Math.max(0,Number(current.credits||0)+delta),updatedAt:now};
      return [next,...profiles.filter(p=>p.studentId!==studentId)];
    });
  }

  const transaction={id:transactionId,studentId,type:'grade_reward',sourceType,sourceId,grade:safeGrade,credits,label:label||`${sourceType} grade ${safeGrade}`,createdAt:previous?.createdAt||now,updatedAt:now};
  await updateJson('gamificationTransactions',[],items=>[transaction,...items.filter(t=>t.id!==transactionId)]);
  return {credits,delta,grade:safeGrade};
}
