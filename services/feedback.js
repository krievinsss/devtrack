import crypto from 'node:crypto';
import { readJson,updateJson } from '@/lib/storage';
import { notifyStudent } from '@/services/notifications';
export async function getFeedback(projectId){return (await readJson('feedback',[])).filter(f=>f.projectId===projectId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
export async function addFeedback(input,user){const item={id:`feedback_${crypto.randomUUID()}`,studentId:input.studentId,projectId:input.projectId,teacherId:user.id,type:input.type,text:input.text.trim(),createdAt:new Date().toISOString()};await updateJson('feedback',[],x=>[item,...x]);await notifyStudent(input.studentId,{type:'feedback',title:'Jauns feedback',message:item.text.slice(0,140),href:`/projects/${input.projectId}`,projectId:input.projectId});return item;}
