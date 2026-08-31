import crypto from 'node:crypto';
import { readJson,updateJson } from '@/lib/storage';
import { gradeFromPercent } from '@/lib/grading';
import { rewardAssessment } from '@/services/gamification';
import { evaluateGamificationProgress } from '@/services/gamificationProgress';
import { notifyStudent } from '@/services/notifications';

export async function getAssessment(projectId){ return (await readJson('assessments',[])).find(a=>a.projectId===projectId)||null; }

export async function saveAssessment(input,user){
  const existing=await getAssessment(input.projectId);
  const criteria=input.criteria?.length?input.criteria:(existing?.criteria||[]);
  const total=criteria.reduce((s,c)=>s+Number(c.score||0),0);
  const maxTotal=criteria.reduce((s,c)=>s+Number(c.max||0),0);
  const percent=maxTotal?Math.round(total/maxTotal*100):(existing?.percent??null);
  const grade=input.manualGrade??(maxTotal?gradeFromPercent(percent):(existing?.grade??1));
  const item={id:input.id||existing?.id||`assessment_${crypto.randomUUID()}`,projectId:input.projectId,studentId:input.studentId,teacherId:user.id,criteria,total,maxTotal,percent,grade,manualGrade:input.manualGrade??existing?.manualGrade??null,updatedAt:new Date().toISOString()};
  await updateJson('assessments',[],arr=>[item,...arr.filter(a=>!(a.projectId===input.projectId&&a.studentId===input.studentId))]);
  try{
    const profile=await rewardAssessment(item);
    const progress=await evaluateGamificationProgress(item.studentId);
    await notifyStudent(item.studentId,{type:'grade',title:'Gala atzīme publicēta',message:`Atzīme ${item.grade}${item.percent!=null?` · ${item.percent}%`:''}`,href:`/projects/${item.projectId}`,projectId:item.projectId});
    return {...item,gamification:{profile:progress?.profile||profile,newAchievements:progress?.newAchievements||[],achievementCredits:progress?.achievementCredits||0}};
  }catch(error){
    console.error('Gamification reward failed',{assessmentId:item.id,studentId:item.studentId,error});
    const failure=new Error(`Assessment was saved, but DevCredits reward failed: ${error?.message||'unknown error'}`);
    failure.cause=error;
    throw failure;
  }
}
