import 'server-only';
import crypto from 'node:crypto';
import { appendVersionedEvent,readVersionedEvents,readJson } from '@/lib/storage';

export async function notifyStudent(studentId,input){
  if(!studentId)return null;
  const item={id:`notification_${crypto.randomUUID()}`,studentId,type:input.type||'general',title:input.title||'New update',message:input.message||'',href:input.href||'/dashboard',projectId:input.projectId||null,assignmentId:input.assignmentId||null,createdAt:new Date().toISOString()};
  await appendVersionedEvent('notifications',studentId,{kind:'notification',...item});
  return item;
}

export async function notifyAssignmentStudents(assignmentId,input){
  const projects=(await readJson('projects',[])).filter(p=>p.assignmentId===assignmentId);
  const ids=[...new Set(projects.map(p=>p.studentId).filter(Boolean))];
  await Promise.all(ids.map(studentId=>notifyStudent(studentId,{...input,assignmentId,href:input.href||'/projects'})));
  return ids.length;
}

export async function getNotifications(studentId,limit=40){
  const events=await readVersionedEvents('notifications',studentId);
  const reads=new Set(events.filter(e=>e.kind==='read').map(e=>e.notificationId));
  const allReadAt=events.filter(e=>e.kind==='read-all').map(e=>Date.parse(e.createdAt||e.eventAt||0)).filter(Number.isFinite).sort((a,b)=>b-a)[0]||0;
  return events.filter(e=>e.kind==='notification').map(e=>({...e,read:reads.has(e.id)||Date.parse(e.createdAt||0)<=allReadAt})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,limit);
}

export async function markNotificationRead(studentId,notificationId){
  await appendVersionedEvent('notifications',studentId,{kind:'read',notificationId,createdAt:new Date().toISOString()});
}
export async function markAllNotificationsRead(studentId){
  await appendVersionedEvent('notifications',studentId,{kind:'read-all',createdAt:new Date().toISOString()});
}
