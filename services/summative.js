import crypto from 'node:crypto';
import { readJson,updateJson,writeJson } from '@/lib/storage';
import { gradeFromPercent } from '@/lib/grading';
import { rewardGradedAssessment } from '@/services/assessmentRewards';
import { notifyStudent } from '@/services/notifications';

export async function getSummativeEvents(assignmentId){return (await readJson('summativeAssessments',[])).filter(x=>x.assignmentId===assignmentId).sort((a,b)=>new Date(a.date)-new Date(b.date))}

export async function createSummative(input,user){
  if(!(await readJson('assignments',[])).some(a=>a.id===input.assignmentId))throw new Error('Project not found');
  const item={id:`summative_${crypto.randomUUID()}`,assignmentId:input.assignmentId,title:input.title.trim(),date:input.date,description:(input.description||'').trim(),criteria:input.criteria,createdBy:user.id,createdAt:new Date().toISOString(),results:[]};
  await updateJson('summativeAssessments',[],items=>[item,...items]);
  return item;
}

export async function saveSummativeResult(input,user){
  const [events,projects]=await Promise.all([readJson('summativeAssessments',[]),readJson('projects',[])]);
  const event=events.find(item=>item.id===input.eventId);
  if(!event)throw new Error('Assessment not found');
  if(!projects.some(p=>p.assignmentId===event.assignmentId&&p.studentId===input.studentId))throw new Error('Student does not belong to this project');
  const scores=(event.criteria||[]).map(criterion=>({name:criterion.name,max:Number(criterion.max),score:Math.max(0,Math.min(Number(input.scores?.find(score=>score.name===criterion.name)?.score||0),Number(criterion.max)))}));
  const total=scores.reduce((sum,item)=>sum+item.score,0),maxTotal=scores.reduce((sum,item)=>sum+item.max,0),percent=maxTotal?Math.round(total/maxTotal*100):0;
  const saved={studentId:input.studentId,scores,total,maxTotal,percent,grade:gradeFromPercent(percent),feedback:(input.feedback||'').trim(),gradedBy:user.id,publishedAt:new Date().toISOString(),eventTitle:event.title||'Summative',assignmentId:event.assignmentId};
  const next=events.map(item=>item.id===event.id?{...item,results:[saved,...(item.results||[]).filter(result=>result.studentId!==input.studentId)]}:item);
  await writeJson('summativeAssessments',next);
  return saved;
}

export async function processSummativeSideEffects(input,saved){
  if(!saved)return;
  try{await Promise.all([rewardGradedAssessment({studentId:input.studentId,sourceId:input.eventId,sourceType:'summative',grade:saved.grade,label:`${saved.eventTitle} · grade ${saved.grade}`}),notifySummativeStudent(input,saved)])}
  catch(error){console.error('Summative side effects failed',{eventId:input.eventId,studentId:input.studentId,error})}
}

async function notifySummativeStudent(input,saved){
  const project=(await readJson('projects',[])).find(p=>p.studentId===input.studentId&&p.assignmentId===saved.assignmentId);
  await notifyStudent(input.studentId,{type:'grade',title:'Summatīvais novērtēts',message:`${saved.eventTitle} · atzīme ${saved.grade}`,href:project?`/projects/${project.id}`:'/projects',projectId:project?.id,assignmentId:saved.assignmentId});
}
