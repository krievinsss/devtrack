'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Fragment,useEffect,useMemo,useState } from 'react';
import { ArrowRight,BookOpen,CalendarCheck2,CalendarClock,ChevronLeft,ChevronRight,CircleAlert,Coffee,LayoutGrid,List,MapPin,Radio,RefreshCw,Sparkles,TimerReset,UsersRound,Wifi } from 'lucide-react';
import { overtimeLabel } from '@/lib/schoolPeriods';

const DAYS=[
  {id:1,long:'Monday',short:'Mon'},
  {id:2,long:'Tuesday',short:'Tue'},
  {id:3,long:'Wednesday',short:'Wed'},
  {id:4,long:'Thursday',short:'Thu'},
  {id:5,long:'Friday',short:'Fri'}
];

export default function TimetableView({timetable,role}){
  const router=useRouter();
  const [view,setView]=useState('week');
  const [now,setNow]=useState(()=>Date.parse(timetable.loadedAt));
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[]);

  const clock=useMemo(()=>rigaClock(now),[now]);
  const days=useMemo(()=>DAYS.map(day=>({...day,date:addDays(timetable.monday,day.id-1),lessons:timetable.lessons.filter(lesson=>lesson.dayId===day.id)})),[timetable.lessons,timetable.monday]);
  const live=useMemo(()=>liveState(timetable.lessons,clock,timetable.monday===timetable.currentWeek),[timetable.lessons,clock,timetable.monday,timetable.currentWeek]);
  const isCurrentWeek=timetable.monday===timetable.currentWeek;
  const audience=role==='student'?'Your group schedule':'Your teaching schedule';

  function refresh(){router.replace(`/timetable?week=${timetable.monday}&fresh=${Date.now()}`,{scroll:false})}

  return <div className="timetable-page">
    <section className="tt-hero">
      <div className="tt-hero-glow one"/><div className="tt-hero-glow two"/>
      <div className="tt-hero-copy">
        <div className="tt-live-source"><span><Wifi size={13}/> LIVE TIMETABLE</span><i>Source synced</i></div>
        <p className="tt-kicker">{audience}</p>
        <h1>{formatRange(timetable.monday,timetable.friday)}</h1>
        <div className="tt-identity"><CalendarCheck2 size={17}/><b>{timetable.identity.label}</b>{timetable.weekName&&<span>{cleanWeekName(timetable.weekName)}</span>}</div>
      </div>
      <div className="tt-hero-stats">
        <div><BookOpen size={18}/><span><strong>{timetable.lessons.length}</strong> lessons</span></div>
        <div><TimerReset size={18}/><span><strong>{formatDuration(timetable.totalMinutes)}</strong> scheduled</span></div>
        <div><UsersRound size={18}/><span><strong>{role==='student'?timetable.teachers.length:timetable.groups.length}</strong> {role==='student'?'teachers':'groups'}</span></div>
      </div>
    </section>

    <section className={`tt-live-panel ${live.current?'is-live':''}`} aria-live="polite">
      <div className="tt-live-icon">{live.current?<Radio size={21}/>:live.next?<CalendarClock size={21}/>:<Sparkles size={21}/>}</div>
      <div className="tt-live-main">
        <span>{live.current?'HAPPENING NOW':live.next?'UP NEXT':isCurrentWeek?'TODAY IS CLEAR':'WEEK OVERVIEW'}</span>
        <h2>{live.focus?.subject||(!timetable.lessons.length?'No lessons published':'No more lessons today')}</h2>
        {live.focus?<LessonMeta lesson={live.focus} role={role}/>:<p>{!timetable.lessons.length?'The timetable source has no lessons for this week.':'Your scheduled lessons for the selected week are shown below.'}</p>}
      </div>
      {live.focus&&<div className="tt-live-time"><b>{live.focus.start}</b><ArrowRight size={15}/><b>{live.focus.end}</b>{live.current?<small>{live.remaining} min left</small>:live.until!=null?<small>{formatUntil(live.until)}</small>:null}</div>}
      {live.current&&<div className="tt-live-progress"><span style={{width:`${live.progress}%`}}/></div>}
    </section>

    <div className="tt-toolbar">
      <div className="tt-week-nav">
        <Link href={`/timetable?week=${timetable.previousWeek}`} aria-label="Previous week"><ChevronLeft size={17}/></Link>
        <Link className={`tt-today-link ${isCurrentWeek?'active':''}`} href={`/timetable?week=${timetable.currentWeek}`}>Today</Link>
        <Link href={`/timetable?week=${timetable.nextWeek}`} aria-label="Next week"><ChevronRight size={17}/></Link>
      </div>
      <div className="tt-toolbar-center"><b>{formatRangeCompact(timetable.monday,timetable.friday)}</b><span>{isCurrentWeek?'Current week':'Selected week'}</span></div>
      <div className="tt-toolbar-actions">
        <button type="button" onClick={refresh} title="Refresh from source"><RefreshCw size={15}/><span>Refresh</span></button>
        <div className="tt-view-switch"><button type="button" className={view==='week'?'active':''} onClick={()=>setView('week')}><LayoutGrid size={15}/><span>Week</span></button><button type="button" className={view==='agenda'?'active':''} onClick={()=>setView('agenda')}><List size={15}/><span>Agenda</span></button></div>
      </div>
    </div>

    {timetable.partialError&&<div className="tt-notice"><CircleAlert size={16}/><span>Part of the timetable could not be loaded: {timetable.partialError}</span></div>}
    {timetable.error&&<div className="tt-error"><CircleAlert size={22}/><div><b>Could not load timetable</b><p>{timetable.error}</p></div><button type="button" onClick={refresh}><RefreshCw size={15}/> Try again</button></div>}

    {!timetable.error&&!timetable.lessons.length?<EmptyWeek timetable={timetable}/>:view==='week'?<WeekGrid days={days} today={clock.date} role={role} liveId={live.current?.id}/>:<Agenda days={days} today={clock.date} role={role} liveId={live.current?.id}/>} 
    <footer className="tt-source-note"><Wifi size={13}/><span>Schedule from <b>api.projekts.area.lv</b> · cached for up to 5 minutes to keep DevTrack fast</span></footer>
  </div>;
}

function WeekGrid({days,today,role,liveId}){
  return <div className="tt-week-grid">{days.map(day=><section className={`tt-day ${day.date===today?'is-today':''}`} key={day.id}>
    <header><div><span>{day.short}</span><strong>{Number(day.date.slice(-2))}</strong></div><div><b>{day.long}</b><small>{day.lessons.length} {day.lessons.length===1?'lesson':'lessons'} · {formatDuration(day.lessons.reduce((sum,item)=>sum+item.durationMinutes,0))}</small></div>{day.date===today&&<i>Today</i>}</header>
    <div className="tt-day-lessons">{day.lessons.length?<LessonsWithBreaks lessons={day.lessons} role={role} liveId={liveId}/>:<div className="tt-day-empty"><Coffee size={20}/><span>No lessons</span></div>}</div>
  </section>)}</div>;
}

function LessonsWithBreaks({lessons,role,liveId}){
  return lessons.map((lesson,index)=>{const previous=lessons[index-1],gap=previous?minutes(lesson.start)-minutes(previous.end):0;return <Fragment key={lesson.id}>{gap>=10&&<div className="tt-break"><span/>{gap} min break<span/></div>}<LessonCard lesson={lesson} role={role} live={lesson.id===liveId}/></Fragment>});
}

function LessonCard({lesson,role,live}){
  const color=colorFor(`${lesson.subject}-${lesson.group}`);
  return <article className={`tt-lesson accent-${color} ${live?'is-live':''}`}>
    <div className="tt-lesson-top"><span>{lesson.start}–{lesson.end}</span><i>{overtimeLabel(lesson.period)}</i></div>
    <h3>{lesson.subject}</h3>
    <LessonMeta lesson={lesson} role={role}/>
    {lesson.division&&lesson.division.toLowerCase()!=='visa klase'&&<span className="tt-division">{lesson.division}</span>}
    {live&&<b className="tt-now-chip"><Radio size={11}/> Now</b>}
  </article>;
}

function Agenda({days,today,role,liveId}){
  return <div className="tt-agenda">{days.map(day=><section className={`tt-agenda-day ${day.date===today?'is-today':''}`} key={day.id}>
    <header><div><span>{day.short}</span><strong>{Number(day.date.slice(-2))}</strong></div><div><h3>{day.long}</h3><p>{formatDate(day.date)} · {day.lessons.length} {day.lessons.length===1?'lesson':'lessons'}</p></div>{day.date===today&&<i>Today</i>}</header>
    <div>{day.lessons.map(lesson=><article className={`tt-agenda-row accent-${colorFor(`${lesson.subject}-${lesson.group}`)} ${lesson.id===liveId?'is-live':''}`} key={lesson.id}><time><b>{lesson.start}</b><span>{lesson.end}</span></time><span className="tt-agenda-line"/><div className="tt-agenda-subject"><span>{overtimeLabel(lesson.period)}</span><h3>{lesson.subject}</h3><LessonMeta lesson={lesson} role={role}/></div>{lesson.id===liveId&&<b className="tt-now-chip"><Radio size={11}/> Now</b>}</article>)}{!day.lessons.length&&<div className="tt-agenda-empty"><Coffee size={18}/> No lessons scheduled</div>}</div>
  </section>)}</div>;
}

function LessonMeta({lesson,role}){
  return <div className="tt-lesson-meta"><span><UsersRound size={13}/>{role==='student'?lesson.teacher:lesson.group}</span><span><MapPin size={13}/>{lesson.room||'Room not set'}</span></div>;
}

function EmptyWeek({timetable}){
  return <section className="tt-empty-week"><div className="tt-empty-calendar"><CalendarClock size={32}/><span>{Number(timetable.monday.slice(-2))}</span></div><span className="eyebrow">NOTHING SCHEDULED</span><h2>This week is wide open</h2><p>No lessons were returned for {formatRange(timetable.monday,timetable.friday)}. The schedule may not have been published yet.</p><Link href={`/timetable?week=${timetable.currentWeek}`}><CalendarCheck2 size={15}/> Back to current week</Link></section>;
}

function liveState(lessons,clock,currentWeek){
  if(!currentWeek)return {current:null,next:null,focus:null,progress:0,remaining:null,until:null};
  const nowValue=ordinal(clock.date)*1440+clock.minutes;
  const current=lessons.find(lesson=>lesson.date===clock.date&&minutes(lesson.start)<=clock.minutes&&minutes(lesson.end)>clock.minutes)||null;
  const next=lessons.find(lesson=>ordinal(lesson.date)*1440+minutes(lesson.start)>nowValue)||null;
  if(current){const start=minutes(current.start),end=minutes(current.end),duration=Math.max(1,end-start);return {current,next,focus:current,progress:Math.max(0,Math.min(100,Math.round((clock.minutes-start)/duration*100))),remaining:Math.max(1,end-clock.minutes),until:null}}
  const until=next?ordinal(next.date)*1440+minutes(next.start)-nowValue:null;
  return {current:null,next,focus:next,progress:0,remaining:null,until};
}

function rigaClock(value){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Riga',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const data=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return {date:`${data.year}-${data.month}-${data.day}`,minutes:Number(data.hour)*60+Number(data.minute)};
}

function addDays(dateValue,amount){const date=new Date(`${dateValue}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+amount);return date.toISOString().slice(0,10)}
function minutes(value){const [hour,minute]=value.split(':').map(Number);return hour*60+minute}
function ordinal(dateValue){return Math.floor(Date.parse(`${dateValue}T00:00:00Z`)/86400000)}
function colorFor(value){let hash=0;for(const char of value)hash=(hash*31+char.charCodeAt(0))|0;return Math.abs(hash)%6}
function formatDuration(value){const hours=Math.floor(value/60),mins=value%60;if(!hours)return `${mins} min`;return mins?`${hours}h ${mins}m`:`${hours}h`}
function formatUntil(value){if(value<60)return `in ${Math.max(1,value)} min`;const days=Math.floor(value/1440),hours=Math.floor(value%1440/60),mins=value%60;if(days)return `in ${days}d ${hours}h`;return mins?`in ${hours}h ${mins}m`:`in ${hours}h`}
function formatDate(value){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T12:00:00Z`))}
function formatRange(start,end){const a=new Date(`${start}T12:00:00Z`),b=new Date(`${end}T12:00:00Z`),sameMonth=a.getUTCMonth()===b.getUTCMonth();const left=new Intl.DateTimeFormat('en-GB',sameMonth?{day:'numeric'}:{day:'numeric',month:'short' }).format(a);const right=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(b);return `${left} – ${right}`}
function formatRangeCompact(start,end){const formatter=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});return `${formatter.format(new Date(`${start}T12:00:00Z`))} – ${formatter.format(new Date(`${end}T12:00:00Z`))}`}
function cleanWeekName(value){const match=value.match(/\(([^)]+)\)/);return match?match[1]:value.replace(/^\S+\s*/,'')}
