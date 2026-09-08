export const ATTENDANCE_STATUSES=['present','late','absent','excused'];

export function attendanceStatus({startsAt,lateAfterMinutes=10,checkedInAt=new Date()}){
  const start=new Date(startsAt).getTime(),checked=new Date(checkedInAt).getTime();
  if(!Number.isFinite(start)||!Number.isFinite(checked))throw new Error('Invalid attendance time');
  return checked>start+Math.max(0,Number(lateAfterMinutes)||0)*60_000?'late':'present';
}

export function attendanceMinutesLate({startsAt,checkedInAt}){
  if(!checkedInAt)return 0;
  return Math.max(0,Math.floor((new Date(checkedInAt).getTime()-new Date(startsAt).getTime())/60_000));
}

export function attendanceSummary(records=[]){
  const summary={total:records.length,present:0,late:0,absent:0,excused:0,attended:0,percentage:0};
  for(const record of records)if(summary[record.status]!==undefined)summary[record.status]+=1;
  summary.attended=summary.present+summary.late;
  summary.percentage=summary.total?Math.round(summary.attended/summary.total*100):0;
  return summary;
}

export function sessionWindow({startsAt,endsAt,now=new Date()}){
  const current=new Date(now).getTime(),start=new Date(startsAt).getTime(),end=new Date(endsAt).getTime();
  if(![current,start,end].every(Number.isFinite)||end<=start)return 'invalid';
  if(current<start)return 'upcoming';
  if(current>end)return 'ended';
  return 'active';
}
