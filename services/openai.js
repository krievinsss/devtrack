import 'server-only';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import { readJson,updateJson } from '@/lib/storage';
import { getProject } from './projects';
import { getAssignment } from './assignments';
import { getFormativeEvents } from './formative';
import { getFeedback } from './feedback';
import { repoFile,repoTree } from './github';

export async function runAiReview(projectId,user){
  const project=await getProject(projectId);if(!project)throw new Error('Project not found');
  const assignment=project.assignmentId?await getAssignment(project.assignmentId):null;
  const formative=assignment?await getFormativeEvents(assignment.id):[];
  const feedback=await getFeedback(projectId);
  if(!process.env.OPENAI_API_KEY){const demo=(await readJson('aiReviews',[])).find(r=>r.projectId===projectId);if(demo)return {...demo,id:`review_${crypto.randomUUID()}`,createdAt:new Date().toISOString(),demo:true};throw new Error('OPENAI_API_KEY is not configured');}
  const tree=(await repoTree(projectId,'')).slice(0,100);const useful=tree.filter(x=>x.type==='blob'&&/\.(js|jsx|ts|tsx|php|py|sql|md|json)$/.test(x.path)).slice(0,16);const files=[];for(const f of useful){try{const d=await repoFile(projectId,f.path);files.push({path:f.path,content:d.content.slice(0,12000)});}catch{}}
  const commits=(await readJson('commits',[])).filter(c=>c.repositoryId===projectId).slice(0,40);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const schema={type:'object',additionalProperties:false,properties:{architecture:{type:'integer',minimum:0,maximum:10},codeQuality:{type:'integer',minimum:0,maximum:10},security:{type:'integer',minimum:0,maximum:10},database:{type:'integer',minimum:0,maximum:10},gitWorkflow:{type:'integer',minimum:0,maximum:10},documentation:{type:'integer',minimum:0,maximum:10},suggestedPoints:{type:'integer',minimum:0,maximum:100},positives:{type:'array',items:{type:'string'}},issues:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},file:{type:'string'},line:{type:['integer','null']},criterion:{type:'string'}},required:['title','file','line','criterion']}},recommendations:{type:'array',items:{type:'string'}},rubricEvidence:{type:'array',items:{type:'object',additionalProperties:false,properties:{criterion:{type:'string'},evidence:{type:'string'},suggestedScore:{type:'number'}},required:['criterion','evidence','suggestedScore']}}},required:['architecture','codeQuality','security','database','gitWorkflow','documentation','suggestedPoints','positives','issues','recommendations','rubricEvidence']};
  const input={assignment:assignment?{title:assignment.title,description:assignment.description,requirements:assignment.requirements,rubric:assignment.rubric,deadline:assignment.deadline}:{description:project.assignment||'',rubric:[]},project:{name:project.name,technologies:project.technologies},repository:{files,commits},formativeHistory:formative.map(e=>({title:e.title,date:e.date,criteria:e.criteria,result:(e.results||[]).find(r=>r.studentId===project.studentId)||null})),teacherFeedback:feedback};
  const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6-mini',input:[{role:'system',content:'You are a private programming-teacher assistant. Evaluate only against supplied assignment requirements and rubric, cite code evidence, consider Git history and formative history, and never claim to set the final grade. Your output is private to the teacher.'},{role:'user',content:JSON.stringify(input)}],text:{format:{type:'json_schema',name:'devtrack_private_review',strict:true,schema}}});
  const parsed=JSON.parse(response.output_text);const maxPoints=(assignment?.rubric||[]).reduce((s,c)=>s+Number(c.max||0),0)||25;const item={id:`review_${crypto.randomUUID()}`,projectId,createdBy:user.id,createdAt:new Date().toISOString(),maxPoints,...parsed};await updateJson('aiReviews',[],x=>[item,...x]);return item;
}
