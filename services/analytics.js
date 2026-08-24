import { readJson } from '@/lib/storage';
import { projectsForStudent } from './projects';
export async function studentAnalytics(studentId){
  const [commits,attendance,assessments,projects]=await Promise.all([readJson('commits',[]),readJson('attendance',[]),readJson('assessments',[]),projectsForStudent(studentId)]);
  const pc=commits.filter(c=>projects.some(p=>p.id===c.repositoryId)).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const a=attendance.find(x=>x.studentId===studentId)||{percentage:0,present:0,late:0,absent:0};
  const scores=assessments.filter(x=>x.studentId===studentId).map(x=>x.grade);
  const averageScore=scores.length?scores.reduce((s,v)=>s+v,0)/scores.length:(projects.reduce((s,p)=>s+(p.teacherScore||0),0)/(projects.length||1));
  const activeDays=new Set(pc.map(c=>c.timestamp.slice(0,10))).size;
  const lastActivity=pc[0]?.timestamp||null;
  const inactivityDays=lastActivity?Math.floor((Date.now()-new Date(lastActivity))/86400000):999;
  const status=a.percentage<60||inactivityDays>14?'At risk':a.percentage<75||inactivityDays>7?'Needs attention':averageScore>=8.5?'Excellent':'Good';
  return {attendance:a,projects,commits:pc,totalCommits:pc.length,averageScore:Number(averageScore.toFixed(1)),activeDays,lastActivity,inactivityDays,status};
}
export function weeklySeries(commits,weeks=12){
  const now=new Date(); const out=[];
  for(let i=weeks-1;i>=0;i--){ const start=new Date(now); start.setUTCDate(start.getUTCDate()-i*7-start.getUTCDay()+1); start.setUTCHours(0,0,0,0); const end=new Date(start);end.setUTCDate(end.getUTCDate()+7); out.push({label:start.toLocaleDateString('lv-LV',{day:'2-digit',month:'short'}),value:commits.filter(c=>new Date(c.timestamp)>=start&&new Date(c.timestamp)<end).length}); }
  return out;
}
export function contributionDays(commits,days=84){ const map=new Map(); commits.forEach(c=>{const d=c.timestamp.slice(0,10);map.set(d,(map.get(d)||0)+1)}); const out=[]; for(let i=days-1;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const k=d.toISOString().slice(0,10);out.push({date:k,count:map.get(k)||0});} return out; }
