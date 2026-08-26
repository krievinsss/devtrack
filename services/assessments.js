import crypto from 'node:crypto';
import { readJson, updateJson } from '@/lib/storage';
import { rewardAssessment } from '@/services/gamification';
import { evaluateGamificationProgress } from '@/services/gamificationProgress';

export async function getAssessment(projectId){ return (await readJson('assessments',[])).find(a=>a.projectId===projectId)||null; }

export async function saveAssessment(input,user){
  const settings=await readJson('settings',{});
  const total=input.criteria.reduce((s,c)=>s+Number(c.score),0);
  const maxTotal=input.criteria.reduce((s,c)=>s+Number(c.max),0);
  const percent=Math.round(total/maxTotal*100);
  const grade=(settings.assessmentGradeMap||[]).find(x=>percent>=x.min)?.grade||1;
  const item={id:input.id||`assessment_${crypto.randomUUID()}`,projectId:input.projectId,studentId:input.studentId,teacherId:user.id,criteria:input.criteria,total,maxTotal,percent,grade,updatedAt:new Date().toISOString()};
  await updateJson('assessments',[],arr=>[item,...arr.filter(a=>!(a.projectId===input.projectId&&a.studentId===input.studentId))]);
  try{
    const profile=await rewardAssessment(item);
    const progress=await evaluateGamificationProgress(item.studentId);
    return {...item,gamification:{profile:progress?.profile||profile,newAchievements:progress?.newAchievements||[],achievementCredits:progress?.achievementCredits||0}};
  }catch(error){
    console.error('Gamification reward failed',{assessmentId:item.id,studentId:item.studentId,error});
    const failure=new Error(`Assessment was saved, but DevCredits reward failed: ${error?.message||'unknown error'}`);
    failure.cause=error;
    throw failure;
  }
}
