import 'server-only';

const DEFAULT_API_URL='https://api.projekts.area.lv';
const DEFAULT_TEACHER_NAME='Toms Ričards Krieviņš';
const RIGA_TIMEZONE='Europe/Riga';

export function dateInRiga(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:RIGA_TIMEZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const value=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function mondayOf(dateValue){
  const safe=/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue||''))?String(dateValue):dateInRiga();
  const date=new Date(`${safe}T12:00:00Z`);
  if(Number.isNaN(date.getTime()))return mondayOf(dateInRiga());
  return addDays(safe,-((date.getUTCDay()+6)%7));
}

export function addDays(dateValue,amount){
  const date=new Date(`${dateValue}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()+amount);
  return date.toISOString().slice(0,10);
}

export function timetableIdentity(user,groups=[]){
  if(user.role==='student'){
    const ids=new Set(user.groupIds||[]);
    const names=[...new Set(groups.filter(group=>ids.has(group.id)).map(group=>String(group.name||'').trim()).filter(Boolean))];
    return {type:'group',names,label:names.join(' · ')||'Your group'};
  }
  const configured=String(process.env.TIMETABLE_TEACHER_NAME||user.timetableTeacherName||'').trim();
  const profileName=`${user.firstName||''} ${user.lastName||''}`.trim();
  const isPrimaryTeacher=String(user.email||'').toLowerCase()===String(process.env.DEVTRACK_TEACHER_EMAIL||'toms.ricards@vtdt.edu.lv').trim().toLowerCase();
  const name=configured||(isPrimaryTeacher?DEFAULT_TEACHER_NAME:profileName);
  return {type:'teacher',names:name?[name]:[],label:name||'Teacher schedule'};
}

export async function timetableForUser(user,groups,weekValue,{fresh=false}={}){
  const monday=mondayOf(weekValue),identity=timetableIdentity(user,groups);
  const base=String(process.env.TIMETABLE_API_URL||DEFAULT_API_URL).replace(/\/$/,'');
  const apiStart=addDays(monday,-2),apiEnd=addDays(monday,4);
  if(!identity.names.length)return timetableResult({monday,identity,lessons:[],error:identity.type==='group'?'Your DevTrack account is not assigned to a group.':'A timetable teacher name has not been configured.'});

  const responses=await Promise.allSettled(identity.names.map(name=>fetchLessons({base,type:identity.type,name,start:apiStart,end:apiEnd,fresh})));
  const raw=[],errors=[];
  for(const response of responses){
    if(response.status==='fulfilled')raw.push(...response.value);
    else errors.push(response.reason instanceof Error?response.reason.message:'Could not load timetable');
  }
  const lessons=normalizeLessons(raw,monday);
  return timetableResult({monday,identity,lessons,error:lessons.length?null:errors[0]||null,partialError:lessons.length&&errors.length?errors[0]:null});
}

async function fetchLessons({base,type,name,start,end,fresh}){
  const url=new URL('/api/lessons',base);
  url.searchParams.set(type==='teacher'?'teacher_name':'group_name',name);
  url.searchParams.set('start_date',start);
  url.searchParams.set('end_date',end);
  url.searchParams.set('with_relations','true');
  url.searchParams.set('limit','500');
  url.searchParams.set('offset','0');
  let response;
  try{
    response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000),...(fresh?{cache:'no-store'}:{next:{revalidate:300,tags:[`timetable-${type}-${name}-${start}`]}})});
  }catch(error){
    if(error?.name==='TimeoutError')throw new Error('The timetable source took too long to respond. Please try again.');
    throw new Error('The timetable source is temporarily unavailable.');
  }
  if(!response.ok){
    if(response.status===429)throw new Error('The timetable source is receiving too many requests. Please wait a moment.');
    throw new Error(`The timetable source returned an error (${response.status}).`);
  }
  let body;
  try{body=await response.json()}catch{throw new Error('The timetable source returned an unexpected response.')}
  if(!Array.isArray(body?.data))throw new Error('The timetable source returned an unexpected response.');
  return body.data;
}

function normalizeLessons(items,monday){
  const unique=new Map();
  for(const item of items){
    const dayId=Number(item.day_id??item.day?.id),period=Number(item.period||0);
    if(!Number.isInteger(dayId)||dayId<1||dayId>5)continue;
    const start=cleanTime(item.start),end=cleanTime(item.end);
    if(!start||!end)continue;
    const lesson={
      id:String(item.id??`${dayId}-${period}-${start}-${item.subject_id}-${item.group_id}-${item.division_id}`),
      date:addDays(monday,dayId-1),
      dayId,
      dayName:String(item.day?.name||''),
      period,
      start,
      end,
      durationMinutes:Math.max(0,timeMinutes(end)-timeMinutes(start)),
      subject:String(item.subject?.name||'Lesson'),
      subjectShort:String(item.subject?.short||''),
      teacher:String(item.teacher?.name||''),
      room:String(item.classroom?.name||''),
      group:String(item.group?.name||''),
      division:String(item.division?.name||''),
      weekName:String(item.week?.name||'')
    };
    unique.set(lesson.id,lesson);
  }
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.subject.localeCompare(b.subject));
}

function timetableResult({monday,identity,lessons,error=null,partialError=null}){
  const totalMinutes=lessons.reduce((sum,lesson)=>sum+lesson.durationMinutes,0);
  return {
    monday,
    friday:addDays(monday,4),
    previousWeek:addDays(monday,-7),
    nextWeek:addDays(monday,7),
    currentWeek:mondayOf(dateInRiga()),
    identity,
    lessons,
    totalMinutes,
    groups:[...new Set(lessons.map(lesson=>lesson.group).filter(Boolean))],
    teachers:[...new Set(lessons.map(lesson=>lesson.teacher).filter(Boolean))],
    classrooms:[...new Set(lessons.map(lesson=>lesson.room).filter(Boolean))],
    weekName:lessons.find(lesson=>lesson.weekName)?.weekName||'',
    error,
    partialError,
    loadedAt:new Date().toISOString()
  };
}

function cleanTime(value){
  const match=String(value||'').match(/^(\d{2}):(\d{2})/);
  return match?`${match[1]}:${match[2]}`:'';
}

function timeMinutes(value){
  const [hours,minutes]=String(value).split(':').map(Number);
  return hours*60+minutes;
}
