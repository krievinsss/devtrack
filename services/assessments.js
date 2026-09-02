import crypto from 'node:crypto';
import { readJson,writeJson } from '@/lib/storage';
import { gradeFromPercent } from '@/lib/grading';
import { rewardAssessment } from '@/services/gamification';
import { evaluateGamificationProgress } from '@/services/gamificationProgress';
import { notifyStudent } from '@/services/notifications';

export async function getAssessment(projectId){ return (await readJson('assessments',[])).find(a=>a.projectId===projectId)||null; }

export async function saveAssessment(input,user){
  const [projects,assessments]=await Promise.all([readJson('projects',[]),readJson('assessments',[])]);
  const project=projects.find(p=>p.id===input.projectId);
  if(!project||project.studentId!==input.studentId)throw new Error('Student does not belong to this project');
  const existing=assessments.find(a=>a.projectId===input.projectId)||null;
  const criteria=input.criteria?.length?input.criteria:(existing?.criteria||[]);
  const total=criteria.reduce((s,c)=>s+Number(c.score||0),0);
  const maxTotal=criteria.reduce((s,c)=>s+Number(c.max||0),0);
  const percent=maxTotal?Math.round(total/maxTotal*100):(existing?.percent??null);
  const grade=input.manualGrade??(maxTotal?gradeFromPercent(percent):(existing?.grade??1));
  const item={id:input.id||existing?.id||`assessment_${crypto.randomUUID()}`,projectId:input.projectId,studentId:input.studentId,teacherId:user.id,criteria,total,maxTotal,percent,grade,manualGrade:input.manualGrade??existing?.manualGrade??null,updatedAt:new Date().toISOString()};
  await writeJson('assessments',[item,...assessments.filter(a=>!(a.projectId===input.projectId&&a.studentId===input.studentId))]);
  return item;
}

export async function processAssessmentSideEffects(item){
  try{
    await rewardAssessment(item);
    await Promise.all([
      evaluateGamificationProgress(item.studentId),
      notifyStudent(item.studentId,{type:'grade',title:'Gala atzīme publicēta',message:`Atzīme ${item.grade}${item.percent!=null?` · ${item.percent}%`:''}`,href:`/projects/${item.projectId}`,projectId:item.projectId})
    ]);
  }catch(error){
    console.error('Assessment side effects failed',{assessmentId:item.id,studentId:item.studentId,error});
  }
}
