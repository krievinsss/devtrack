import 'server-only';
import OpenAI from 'openai';
import crypto from 'node:crypto';
import { readJson, updateJson } from '@/lib/storage';
import { getProject } from './projects';
import { repoFile, repoTree } from './github';

export async function runAiReview(projectId,user){
  const project=await getProject(projectId); if(!project)throw new Error('Project not found');
  if(!process.env.OPENAI_API_KEY){ const demo=(await readJson('aiReviews',[])).find(r=>r.projectId===projectId); if(demo)return {...demo,id:`review_${crypto.randomUUID()}`,createdAt:new Date().toISOString(),demo:true}; throw new Error('OPENAI_API_KEY is not configured'); }
  const tree=(await repoTree(projectId,'')).slice(0,80); const useful=tree.filter(x=>x.type==='blob' && /\.(js|jsx|ts|tsx|php|py|sql|md|json)$/.test(x.path)).slice(0,12);
  const files=[]; for(const f of useful){ try{const d=await repoFile(projectId,f.path); files.push({path:f.path,content:d.content.slice(0,12000)});}catch{} }
  const commits=(await readJson('commits',[])).filter(c=>c.repositoryId===projectId).slice(0,30);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
  const schema={type:'object',additionalProperties:false,properties:{architecture:{type:'integer',minimum:0,maximum:10},codeQuality:{type:'integer',minimum:0,maximum:10},security:{type:'integer',minimum:0,maximum:10},database:{type:'integer',minimum:0,maximum:10},gitWorkflow:{type:'integer',minimum:0,maximum:10},documentation:{type:'integer',minimum:0,maximum:10},suggestedPoints:{type:'integer',minimum:0,maximum:25},positives:{type:'array',items:{type:'string'}},issues:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},file:{type:'string'},line:{type:['integer','null']}},required:['title','file','line']}},recommendations:{type:'array',items:{type:'string'}}},required:['architecture','codeQuality','security','database','gitWorkflow','documentation','suggestedPoints','positives','issues','recommendations']};
  const response=await client.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6-mini',input:[{role:'system',content:'You are a senior programming teacher. Review evidence conservatively. Never assign the final grade; suggestedPoints is only a recommendation.'},{role:'user',content:JSON.stringify({assignment:project.assignment,project:{name:project.name,technologies:project.technologies},files,commits})}],text:{format:{type:'json_schema',name:'devtrack_review',strict:true,schema}}});
  const parsed=JSON.parse(response.output_text); const item={id:`review_${crypto.randomUUID()}`,projectId,createdBy:user.id,createdAt:new Date().toISOString(),maxPoints:25,...parsed}; await updateJson('aiReviews',[],x=>[item,...x]); return item;
}
