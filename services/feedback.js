import crypto from 'node:crypto'; import { readJson, updateJson } from '@/lib/storage';
export async function getFeedback(projectId){ return (await readJson('feedback',[])).filter(f=>f.projectId===projectId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); }
export async function addFeedback(input,user){ const item={id:`feedback_${crypto.randomUUID()}`,studentId:input.studentId,projectId:input.projectId,teacherId:user.id,type:input.type,text:input.text.trim(),createdAt:new Date().toISOString()}; await updateJson('feedback',[],x=>[item,...x]); return item; }
