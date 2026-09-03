import { z } from 'zod';
import { after } from 'next/server';
import { requireApiUser, fail, ok } from '@/lib/http';
import { getUsers } from '@/services/users';
import { getSpotifyAccount,spotifyNowPlaying,spotifyQueue } from '@/services/spotify';
import { MUSIC_RULES,MUSIC_RULES_VERSION,acceptMusicRules,addMusicRequest,banMusicStudent,clearMusicQueue,getMusicAccess,getMusicAccessList,getMusicSnapshot,getMusicSettings,moderateMusicRequest,payMusicFine,removeMusicRequest,setMusicRequestsEnabled,setMusicRequestStatus,unbanMusicStudent } from '@/services/music';
import { evaluateGamificationProgress } from '@/services/gamificationProgress';

const requestSchema=z.object({action:z.literal('request'),title:z.string().min(1),artist:z.string().optional().default(''),spotifyUrl:z.string().optional().default(''),spotifyId:z.string().optional().default(''),spotifyUri:z.string().optional().default(''),image:z.string().optional().default(''),durationMs:z.coerce.number().optional().default(0),explicit:z.boolean().optional().default(false)});
const actionSchema=z.union([
  z.object({action:z.literal('accept_rules')}),
  requestSchema,
  z.object({action:z.literal('remove_request'),requestId:z.string()}),
  z.object({action:z.literal('moderate_request'),requestId:z.string(),status:z.enum(['played','removed'])}),
  z.object({action:z.literal('clear_queue')}),
  z.object({action:z.literal('toggle_requests'),enabled:z.boolean()}),
  z.object({action:z.literal('ban_student'),studentId:z.string(),durationMinutes:z.coerce.number().positive(),reason:z.string().min(1),severity:z.enum(['low','medium','high']).default('medium'),fine:z.coerce.number().min(0).default(500)}),
  z.object({action:z.literal('unban_student'),studentId:z.string()}),
  z.object({action:z.literal('pay_fine')})
]);

async function connectedSpotifyOwner(users){
  for(const u of users.filter(x=>['teacher','admin'].includes(x.role))){
    if(await getSpotifyAccount(u.id))return u;
  }
  return null;
}

async function reconcileQueueWithSpotify(owner,queue){
  if(!owner||!queue.length)return {queue,nowPlaying:null,completedStudentIds:[]};
  let nowPlaying=null;
  try{nowPlaying=await spotifyNowPlaying(owner.id)}catch{return {queue,nowPlaying:null,completedStudentIds:[]}}
  if(!nowPlaying?.id)return {queue,nowPlaying,completedStudentIds:[]};

  const playingIndex=queue.findIndex(item=>item.spotifyId===nowPlaying.id);
  if(playingIndex<0)return {queue,nowPlaying,completedStudentIds:[]};

  // If Spotify has reached a queued DevTrack request, that request is no longer waiting.
  // Any older DevTrack entries before it have necessarily already been passed as well.
  const completed=queue.slice(0,playingIndex+1);
  for(const item of completed){
    try{
      await setMusicRequestStatus(item.id,'played',{
        playedAt:new Date().toISOString(),
        autoReconciled:true,
        spotifyNowPlayingId:nowPlaying.id
      },item);
    }catch{
      // Another polling client may have reconciled it milliseconds earlier.
    }
  }
  return {queue:queue.slice(playingIndex+1),nowPlaying,completed,completedStudentIds:[...new Set(completed.map(x=>x.studentId).filter(Boolean))]};
}

export async function GET(){
  const auth=await requireApiUser(['student','teacher','admin']);
  if(auth.error)return auth.error;
  try{
    const [settings,music,users]=await Promise.all([getMusicSettings(),getMusicSnapshot(),getUsers()]);
    const spotifyOwner=await connectedSpotifyOwner(users);
    const reconciled=await reconcileQueueWithSpotify(spotifyOwner,music.queue);
    const newlyPlayed=(reconciled.completed||[]).map(item=>({...item,status:'played',playedAt:new Date().toISOString(),autoReconciled:true,spotifyNowPlayingId:reconciled.nowPlaying?.id}));
    const payload={
      settings:{...settings,spotifyConnected:!!spotifyOwner},
      queue:reconciled.queue,
      nowPlaying:reconciled.nowPlaying,
      rules:MUSIC_RULES,
      rulesVersion:MUSIC_RULES_VERSION,
      history:[...newlyPlayed,...music.history].slice(0,100)
    };
    if(reconciled.completedStudentIds.length)after(()=>Promise.all(reconciled.completedStudentIds.map(id=>evaluateGamificationProgress(id))));
    if(auth.user.role==='student'){
      payload.access=await getMusicAccess(auth.user.id);
    }else{
      const access=await getMusicAccessList();
      payload.students=users.filter(u=>u.role==='student').map(s=>({id:s.id,name:`${s.firstName} ${s.lastName}`,email:s.email,access:access.find(a=>a.studentId===s.id)||null}));
      payload.spotifyConnected=!!spotifyOwner;
    }
    return ok(payload);
  }catch(e){
    return fail(e.message||'Could not load Classroom Music',500);
  }
}

export async function POST(req){
  const auth=await requireApiUser(['student','teacher','admin']);
  if(auth.error)return auth.error;
  try{
    const body=actionSchema.parse(await req.json());
    let result;
    switch(body.action){
      case'accept_rules':
        if(auth.user.role!=='student')throw new Error('Student action only');
        result=await acceptMusicRules(auth.user.id);
        break;
      case'request':{
        if(auth.user.role!=='student')throw new Error('Student action only');
        if(!body.spotifyUri)throw new Error('Spotify track is required');
        const users=await getUsers();
        const owner=await connectedSpotifyOwner(users);
        if(!owner)throw new Error('Teacher Spotify is not connected');
        result=await addMusicRequest(auth.user,{...body,status:'requested'});
        try{
          await spotifyQueue(owner.id,body.spotifyUri);
          result=await setMusicRequestStatus(result.id,'queued',{spotifyQueuedAt:new Date().toISOString()},result);
          after(()=>evaluateGamificationProgress(auth.user.id));
        }catch(e){
          await setMusicRequestStatus(result.id,'failed',{spotifyError:e.message||'Spotify queue failed'},result);
          throw e;
        }
        break;
      }
      case'remove_request':result=await removeMusicRequest(body.requestId,auth.user);break;
      case'moderate_request':result=await moderateMusicRequest(body.requestId,body.status,auth.user);break;
      case'clear_queue':result=await clearMusicQueue(auth.user);break;
      case'toggle_requests':result=await setMusicRequestsEnabled(body.enabled,auth.user);break;
      case'ban_student':result=await banMusicStudent(body.studentId,body,auth.user);break;
      case'unban_student':result=await unbanMusicStudent(body.studentId,auth.user);break;
      case'pay_fine':
        if(auth.user.role!=='student')throw new Error('Student action only');
        result=await payMusicFine(auth.user.id);
        break;
    }
    return ok({result});
  }catch(e){
    return fail(e.message||'Music action failed',400,e?.issues);
  }
}
