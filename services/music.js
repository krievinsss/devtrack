import crypto from 'node:crypto';
import { readJson, updateJson, appendVersionedEvent, readVersionedEvents } from '@/lib/storage';

export const MUSIC_RULES_VERSION=1;
export const MUSIC_FINE_DEFAULT=500;
export const MUSIC_REQUEST_COOLDOWN_MS=5*60*1000;
export const MUSIC_FREE_REQUESTS_PER_DAY=3;
export const MUSIC_REQUEST_COST=20;
export const MUSIC_RULES=[
  'Pievieno tikai mācību videi piemērotu mūziku.',
  'Neizmanto dziesmu pieprasījumus, lai traucētu stundu vai provocētu citus.',
  'Neatkārto vienu un to pašu dziesmu un nespamo rindu.',
  'Skolotājs drīkst dziesmu izņemt, noraidīt vai apturēt pieprasījumus bez iepriekšēja brīdinājuma.',
  'Par neatbilstošu izmantošanu var tikt piešķirts pagaidu bans un DevCredits sods.'
];
const MUSIC_EVENT_KEY='classroom';

function blankAccess(studentId){return{studentId,acceptedRulesVersion:0,acceptedAt:null,banUntil:null,banReason:'',severity:null,fineDue:0,finePaidAt:null,updatedAt:new Date().toISOString()}}
function blankGamification(studentId){return{studentId,credits:0,xp:0,level:1,inventory:[],equipped:{avatar:null,avatar_frame:null,title:null,slug:null,ui_theme:null},rewards:{},claimedLevels:[1],achievements:[],updatedAt:new Date().toISOString()}}
async function musicGamification(studentId){return(await readJson('gamificationProfiles',[])).find(profile=>profile.studentId===studentId)||blankGamification(studentId)}
export async function getMusicSettings(){return readJson('musicSettings',{requestsEnabled:true,spotifyConnected:false,nowPlaying:null,updatedAt:null})}
export async function getMusicAccess(studentId){const rows=await readJson('musicAccess',[]);return rows.find(x=>x.studentId===studentId)||blankAccess(studentId)}
export async function getMusicAccessList(){return readJson('musicAccess',[])}
export async function acceptMusicRules(studentId){let saved;await updateJson('musicAccess',[],rows=>{const current=rows.find(x=>x.studentId===studentId)||blankAccess(studentId);saved={...current,acceptedRulesVersion:MUSIC_RULES_VERSION,acceptedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return[saved,...rows.filter(x=>x.studentId!==studentId)]});return saved}
export function activeMusicBan(access){return!!(access?.banUntil&&new Date(access.banUntil).getTime()>Date.now())}

async function musicEvents(){return readVersionedEvents('music',MUSIC_EVENT_KEY)}
function reduceRequests(events){
  const map=new Map();
  for(const event of events){
    if(event.type==='add'&&event.request) map.set(event.request.id,event.request);
    if(event.type==='patch'&&event.requestId&&map.has(event.requestId)) map.set(event.requestId,{...map.get(event.requestId),...(event.patch||{}),updatedAt:event.eventAt||new Date().toISOString()});
    if(event.type==='clear'&&Array.isArray(event.requests)) for(const request of event.requests) map.set(request.id,{...(map.get(request.id)||{}),...request,updatedAt:event.eventAt||request.updatedAt});
  }
  return [...map.values()];
}

async function allMusicRequests(){
  const events=await musicEvents();
  return events.length?reduceRequests(events):await readJson('musicQueue',[]);
}
function dayKey(value){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return'';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Riga',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=type=>parts.find(x=>x.type===type)?.value||'';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export async function getMusicAllowance(studentId,knownRequests=null){
  const [requests,profile]=await Promise.all([knownRequests?Promise.resolve(knownRequests):allMusicRequests(),musicGamification(studentId)]);
  const today=dayKey(Date.now());
  const daily=requests.filter(item=>item.studentId===studentId&&item.status!=='failed'&&item.createdAt&&dayKey(item.createdAt)===today).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const last=daily[daily.length-1];
  const cooldownUntil=last?new Date(new Date(last.createdAt).getTime()+MUSIC_REQUEST_COOLDOWN_MS).toISOString():null;
  const remainingCooldownMs=Math.max(0,(cooldownUntil?new Date(cooldownUntil).getTime():0)-Date.now());
  const nextRequestCost=daily.length>=MUSIC_FREE_REQUESTS_PER_DAY?MUSIC_REQUEST_COST:0;
  const credits=Number(profile.credits||0);
  return {day:today,dailyRequestCount:daily.length,freeRequestsRemaining:Math.max(0,MUSIC_FREE_REQUESTS_PER_DAY-daily.length),nextRequestCost,cooldownUntil,remainingCooldownMs,cooldownMs:MUSIC_REQUEST_COOLDOWN_MS,credits,canAfford:credits>=nextRequestCost};
}
function reduceQueue(events){
  return reduceRequests(events).filter(x=>!['removed','failed','played'].includes(x.status)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
}

export async function getMusicSnapshot(limit=100){
  const events=await musicEvents();
  const rows=events.length?reduceRequests(events):await readJson('musicQueue',[]);
  return {
    requests:rows,
    queue:rows.filter(x=>!['removed','failed','played'].includes(x.status)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)),
    history:rows.filter(x=>['removed','failed','played'].includes(x.status)).sort((a,b)=>new Date(b.playedAt||b.removedAt||b.updatedAt||b.createdAt)-new Date(a.playedAt||a.removedAt||a.updatedAt||a.createdAt)).slice(0,limit)
  };
}

export async function getMusicHistory(limit=100){
  return (await getMusicSnapshot(limit)).history;
}
export async function getMusicQueue(){
  const events=await musicEvents();
  if(events.length) return reduceQueue(events);
  // Backward compatibility: surface old queue while the new event log starts fresh.
  return (await readJson('musicQueue',[])).filter(x=>!['removed','failed','played'].includes(x.status)).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
}

export async function addMusicRequest(student,input){
  const [access,settings,current,allowance]=await Promise.all([getMusicAccess(student.id),getMusicSettings(),getMusicQueue(),getMusicAllowance(student.id)]);
  if(access.acceptedRulesVersion!==MUSIC_RULES_VERSION)throw new Error('Accept the classroom music rules first');
  if(activeMusicBan(access))throw new Error('Music access is temporarily banned');
  if(Number(access.fineDue||0)>0)throw new Error('Pay the outstanding DevCredits fine first');
  if(!settings.requestsEnabled)throw new Error('Song requests are currently paused');
  if(allowance.remainingCooldownMs>0)throw new Error(`You can request another song in ${Math.max(1,Math.ceil(allowance.remainingCooldownMs/60000))} min`);
  if(!allowance.canAfford)throw new Error(`This request costs ${allowance.nextRequestCost} DC. You currently have ${allowance.credits} DC`);
  const title=String(input.title||'').trim(),artist=String(input.artist||'').trim(),spotifyUrl=String(input.spotifyUrl||'').trim(),spotifyId=String(input.spotifyId||'').trim(),spotifyUri=String(input.spotifyUri||'').trim();
  if(!title)throw new Error('Song title is required');
  const duplicate=current.find(x=>((spotifyId&&x.spotifyId===spotifyId)||(!spotifyId&&x.title.toLowerCase()===title.toLowerCase()&&String(x.artist||'').toLowerCase()===artist.toLowerCase())));
  if(duplicate)throw new Error('This song is already in the classroom queue');
  const createdAt=new Date().toISOString();
  const created={id:`music_${crypto.randomUUID()}`,studentId:student.id,studentName:`${student.firstName} ${student.lastName}`,title,artist,spotifyUrl,spotifyId,spotifyUri,image:String(input.image||''),durationMs:Number(input.durationMs||0),explicit:!!input.explicit,status:input.status||'requested',requestCost:allowance.nextRequestCost,dailyRequestNumber:allowance.dailyRequestCount+1,votes:[],createdAt,updatedAt:createdAt};
  await appendVersionedEvent('music',MUSIC_EVENT_KEY,{type:'add',request:created});
  return created;
}
export async function chargeMusicRequest(studentId,request){
  const cost=Math.max(0,Number(request?.requestCost||0));
  if(!cost)return null;
  const base=await musicGamification(studentId),sourceKey=`music_request:${request.id}`;
  let charged=false,saved=null;
  await updateJson('gamificationProfiles',[],rows=>{
    const current=rows.find(x=>x.studentId===studentId)||base,existing=current.rewards?.[sourceKey];
    if(existing?.status==='charged'){saved=current;return rows}
    if(existing?.status==='refunded')throw new Error('This music request charge has already been refunded');
    if(Number(current.credits||0)<cost)throw new Error(`This request costs ${cost} DC. You currently have ${Number(current.credits||0)} DC`);
    charged=true;saved={...current,credits:Number(current.credits||0)-cost,rewards:{...(current.rewards||{}),[sourceKey]:{credits:-cost,status:'charged',requestId:request.id,chargedAt:new Date().toISOString()}},updatedAt:new Date().toISOString()};
    return[saved,...rows.filter(x=>x.studentId!==studentId)];
  });
  if(charged)await updateJson('gamificationTransactions',[],rows=>[{id:`music_charge_${request.id}`,studentId,type:'music_request',sourceKey,requestId:request.id,credits:-cost,xp:0,label:`Classroom Music request #${request.dailyRequestNumber||''}`.trim(),createdAt:new Date().toISOString()},...rows.filter(x=>x.id!==`music_charge_${request.id}`)]);
  return saved;
}
export async function refundMusicRequestCharge(studentId,request){
  const cost=Math.max(0,Number(request?.requestCost||0));
  if(!cost)return null;
  const sourceKey=`music_request:${request.id}`;let refunded=false,saved=null;
  await updateJson('gamificationProfiles',[],rows=>{
    const current=rows.find(x=>x.studentId===studentId);if(!current)return rows;
    const existing=current.rewards?.[sourceKey];if(existing?.status!=='charged'){saved=current;return rows}
    refunded=true;saved={...current,credits:Number(current.credits||0)+cost,rewards:{...(current.rewards||{}),[sourceKey]:{...existing,status:'refunded',refundedAt:new Date().toISOString()}},updatedAt:new Date().toISOString()};
    return[saved,...rows.filter(x=>x.studentId!==studentId)];
  });
  if(refunded)await updateJson('gamificationTransactions',[],rows=>[{id:`music_refund_${request.id}`,studentId,type:'music_request_refund',sourceKey,requestId:request.id,credits:cost,xp:0,label:'Refunded failed Classroom Music request',createdAt:new Date().toISOString()},...rows.filter(x=>x.id!==`music_refund_${request.id}`)]);
  return saved;
}
export async function setMusicRequestStatus(requestId,status,extra={},knownRequest=null){
  const current=knownRequest||(await getMusicQueue()).find(x=>x.id===requestId);
  if(!current)throw new Error('Request not found');
  const patch={...extra,status,updatedAt:new Date().toISOString()};
  await appendVersionedEvent('music',MUSIC_EVENT_KEY,{type:'patch',requestId,patch});
  return {...current,...patch};
}
export async function removeMusicRequest(requestId,actor){
  const current=(await getMusicQueue()).find(x=>x.id===requestId);
  if(!current)throw new Error('Request not found');
  if(actor.role==='student'&&current.studentId!==actor.id)throw new Error('You can only remove your own request');
  return setMusicRequestStatus(requestId,'removed',{removedBy:actor.id,removedAt:new Date().toISOString()},current);
}
export async function moderateMusicRequest(requestId,status,actor){
  if(!['teacher','admin'].includes(actor.role))throw new Error('Teacher access required');
  if(!['played','removed'].includes(status))throw new Error('Invalid queue status');
  const current=(await getMusicQueue()).find(x=>x.id===requestId);
  if(!current)throw new Error('Request not found');
  return setMusicRequestStatus(requestId,status,{moderatedBy:actor.id,...(status==='removed'?{removedAt:new Date().toISOString()}:{playedAt:new Date().toISOString()})},current);
}
export async function clearMusicQueue(actor){
  if(!['teacher','admin'].includes(actor.role))throw new Error('Teacher access required');
  const current=await getMusicQueue();
  if(!current.length)return [];
  const removedAt=new Date().toISOString();
  const requests=current.map(request=>({...request,status:'removed',removedAt,removedBy:actor.id,moderatedBy:actor.id,removalReason:'queue_cleared',updatedAt:removedAt}));
  await appendVersionedEvent('music',MUSIC_EVENT_KEY,{type:'clear',requests,clearedBy:actor.id,clearedAt:removedAt});
  return requests;
}
export async function setMusicRequestsEnabled(enabled,actor){if(!['teacher','admin'].includes(actor.role))throw new Error('Teacher access required');let saved;await updateJson('musicSettings',{},current=>{saved={...current,requestsEnabled:!!enabled,updatedAt:new Date().toISOString(),updatedBy:actor.id};return saved});return saved}
export async function banMusicStudent(studentId,input,actor){if(!['teacher','admin'].includes(actor.role))throw new Error('Teacher access required');const durationMinutes=Math.max(1,Number(input.durationMinutes||60)),fine=Math.max(0,Number(input.fine??MUSIC_FINE_DEFAULT));let saved;await updateJson('musicAccess',[],rows=>{const current=rows.find(x=>x.studentId===studentId)||blankAccess(studentId);saved={...current,banUntil:new Date(Date.now()+durationMinutes*60000).toISOString(),banReason:String(input.reason||'Classroom music rules violation').trim(),severity:input.severity||'medium',fineDue:fine,finePaidAt:null,bannedBy:actor.id,updatedAt:new Date().toISOString()};return[saved,...rows.filter(x=>x.studentId!==studentId)]});return saved}
export async function unbanMusicStudent(studentId,actor){if(!['teacher','admin'].includes(actor.role))throw new Error('Teacher access required');let saved;await updateJson('musicAccess',[],rows=>{const current=rows.find(x=>x.studentId===studentId)||blankAccess(studentId);saved={...current,banUntil:null,banReason:'',severity:null,fineDue:0,finePaidAt:null,unbannedBy:actor.id,updatedAt:new Date().toISOString()};return[saved,...rows.filter(x=>x.studentId!==studentId)]});return saved}
export async function payMusicFine(studentId){const access=await getMusicAccess(studentId),fine=Math.max(0,Number(access.fineDue||0));if(!fine)return access;await updateJson('gamificationProfiles',[],rows=>{const profile=rows.find(x=>x.studentId===studentId);if(!profile)throw new Error('Gamification profile not found');if(Number(profile.credits||0)<fine)throw new Error(`You need ${fine} DevCredits to pay this fine`);const updated={...profile,credits:Number(profile.credits)-fine,updatedAt:new Date().toISOString()};return[updated,...rows.filter(x=>x.studentId!==studentId)]});let saved;await updateJson('musicAccess',[],rows=>{const current=rows.find(x=>x.studentId===studentId)||blankAccess(studentId);saved={...current,fineDue:0,finePaidAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return[saved,...rows.filter(x=>x.studentId!==studentId)]});await updateJson('gamificationTransactions',[],rows=>[{id:`tx_${crypto.randomUUID()}`,studentId,type:'music_fine',credits:-fine,xp:0,label:'Classroom Music fine',createdAt:new Date().toISOString()},...rows]);return saved}
