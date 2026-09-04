import crypto from 'node:crypto';
import { unstable_cache } from 'next/cache';
import { readJson, updateJson } from '@/lib/storage';

const ACCOUNTS_KEY = 'spotifyAccounts';
const RATE_LIMIT_KEY = 'spotifyRateLimit';
const SCOPES = ['user-read-playback-state','user-read-currently-playing','user-modify-playback-state'];
const SPOTIFY_NOW_PLAYING_SECONDS=15;
const SPOTIFY_SEARCH_COOLDOWN_MS=2000;
const runtime=globalThis.__devtrackSpotifyRuntime||(globalThis.__devtrackSpotifyRuntime={backoffUntil:0,backoffCheckedAt:0,searches:new Map(),snapshots:new Map()});

function config(){
  const clientId=process.env.SPOTIFY_CLIENT_ID;
  const clientSecret=process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri=process.env.SPOTIFY_REDIRECT_URI;
  if(!clientId||!clientSecret||!redirectUri) throw new Error('Spotify environment variables are not configured');
  return {clientId,clientSecret,redirectUri};
}

export function createSpotifyState(userId){
  const secret=process.env.SESSION_SECRET||process.env.AUTH_SECRET||process.env.SPOTIFY_CLIENT_SECRET;
  if(!secret) throw new Error('Spotify state signing secret unavailable');
  const payload=Buffer.from(JSON.stringify({userId,nonce:crypto.randomUUID(),ts:Date.now()})).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readSpotifyState(state){
  const secret=process.env.SESSION_SECRET||process.env.AUTH_SECRET||process.env.SPOTIFY_CLIENT_SECRET;
  const [payload,sig]=String(state||'').split('.');
  if(!payload||!sig||!secret) throw new Error('Invalid Spotify state');
  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  if(sig.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) throw new Error('Invalid Spotify state');
  const data=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(Date.now()-Number(data.ts||0)>10*60_000) throw new Error('Spotify authorization expired');
  return data;
}

export function spotifyAuthorizeUrl(userId){
  const {clientId,redirectUri}=config();
  const q=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,scope:SCOPES.join(' '),state:createSpotifyState(userId),show_dialog:'true'});
  return `https://accounts.spotify.com/authorize?${q}`;
}

async function tokenRequest(params){
  const {clientId,clientSecret}=config();
  const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),cache:'no-store'});
  const d=await r.json();
  if(!r.ok) throw new Error(d.error_description||d.error||'Spotify token request failed');
  return d;
}

export async function exchangeSpotifyCode(code,userId){
  const {redirectUri}=config();
  const token=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:redirectUri});
  const me=await spotifyRaw(token.access_token,'v1/me');
  const saved={userId,spotifyUserId:me.id,displayName:me.display_name||me.id,accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:Date.now()+Number(token.expires_in||3600)*1000,scope:token.scope||SCOPES.join(' '),connectedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  await updateJson(ACCOUNTS_KEY,[],rows=>[saved,...rows.filter(x=>x.userId!==userId)]);
  return saved;
}

export async function getSpotifyAccount(userId){return (await readJson(ACCOUNTS_KEY,[])).find(x=>x.userId===userId)||null}

function rateLimitError(until){const seconds=Math.max(1,Math.ceil((until-Date.now())/1000)),error=new Error(`Spotify rate limit reached. Try again in ${seconds} seconds.`);error.status=429;error.retryAfter=seconds;error.backoffUntil=until;return error}
async function assertSpotifyAvailable(){
  if(Date.now()-runtime.backoffCheckedAt>10000){
    runtime.backoffCheckedAt=Date.now();
    try{const saved=await readJson(RATE_LIMIT_KEY,{until:0});runtime.backoffUntil=Math.max(runtime.backoffUntil,Number(saved?.until||0))}catch{}
  }
  if(runtime.backoffUntil>Date.now())throw rateLimitError(runtime.backoffUntil);
}
async function rememberRateLimit(retryAfter){
  const until=Date.now()+Math.max(1,Number(retryAfter||30))*1000;runtime.backoffUntil=Math.max(runtime.backoffUntil,until);runtime.backoffCheckedAt=Date.now();
  try{await updateJson(RATE_LIMIT_KEY,{until:0},current=>({...current,until:Math.max(Number(current?.until||0),until),updatedAt:new Date().toISOString()}))}catch{}
  return runtime.backoffUntil;
}

async function spotifyRaw(token,endpoint,options={}){
  await assertSpotifyAvailable();
  const r=await fetch(`https://api.spotify.com/${endpoint}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},cache:'no-store'});
  if(r.status===204) return null;
  const text=await r.text(); let d=null; try{d=text?JSON.parse(text):null}catch{d=text}
  if(!r.ok){
    const retryAfter=Math.max(0,Number(r.headers.get('retry-after')||0));
    if(r.status===429)throw rateLimitError(await rememberRateLimit(retryAfter));
    const error=new Error(d?.error?.message||d?.error_description||`Spotify API failed (${r.status})`);error.status=r.status;throw error;
  }
  return d;
}

export async function spotifyAccessToken(userId){
  let account=await getSpotifyAccount(userId);
  if(!account) throw new Error('Spotify is not connected');
  if(Number(account.expiresAt||0)>Date.now()+60_000) return account.accessToken;
  if(!account.refreshToken) throw new Error('Spotify refresh token unavailable');
  const refreshed=await tokenRequest({grant_type:'refresh_token',refresh_token:account.refreshToken});
  account={...account,accessToken:refreshed.access_token,refreshToken:refreshed.refresh_token||account.refreshToken,expiresAt:Date.now()+Number(refreshed.expires_in||3600)*1000,scope:refreshed.scope||account.scope,updatedAt:new Date().toISOString()};
  await updateJson(ACCOUNTS_KEY,[],rows=>[account,...rows.filter(x=>x.userId!==userId)]);
  return account.accessToken;
}

export async function spotifyApi(userId,endpoint,options){return spotifyRaw(await spotifyAccessToken(userId),endpoint,options)}

async function loadSpotifySearch(userId,query){
  const d=await spotifyApi(userId,`v1/search?type=track&limit=8&q=${encodeURIComponent(query)}`);
  return (d?.tracks?.items||[]).map(t=>({id:t.id,uri:t.uri,title:t.name,artist:t.artists?.map(a=>a.name).join(', ')||'',album:t.album?.name||'',image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||'',durationMs:t.duration_ms,explicit:!!t.explicit,spotifyUrl:t.external_urls?.spotify||''}));
}

async function loadSpotifyNowPlaying(userId){
  const d=await spotifyApi(userId,'v1/me/player/currently-playing');
  const fetchedAt=Date.now();
  if(!d?.item)return {nowPlaying:null,fetchedAt};
  return {nowPlaying:{id:d.item.id,title:d.item.name,artist:d.item.artists?.map(a=>a.name).join(', ')||'',image:d.item.album?.images?.[1]?.url||d.item.album?.images?.[0]?.url||'',durationMs:Number(d.item.duration_ms||0),progressMs:Number(d.progress_ms||0),isPlaying:!!d.is_playing,spotifyUrl:d.item.external_urls?.spotify||'',fetchedAt},fetchedAt};
}

async function rememberNowPlaying(userId,snapshot){
  if(runtime.snapshots.get(userId)?.fetchedAt===snapshot.fetchedAt)return;
  runtime.snapshots.set(userId,snapshot);
  try{
    await updateJson('spotifyPlaybackSnapshots',[],rows=>{
      const current=rows.find(item=>item.userId===userId),changed=current?.nowPlaying?.id!==snapshot.nowPlaying?.id||Boolean(current?.nowPlaying?.isPlaying)!==Boolean(snapshot.nowPlaying?.isPlaying),heartbeat=Date.now()-new Date(current?.checkedAt||0).getTime()>60000;
      if(!changed&&!heartbeat)return rows;
      const saved={userId,nowPlaying:snapshot.nowPlaying,sourceFetchedAt:snapshot.fetchedAt,checkedAt:new Date().toISOString()};
      return[saved,...rows.filter(item=>item.userId!==userId)];
    });
  }catch{}
}
async function lastNowPlaying(userId,error){
  let saved=runtime.snapshots.get(userId);
  if(!saved){try{const row=(await readJson('spotifyPlaybackSnapshots',[])).find(item=>item.userId===userId);if(row)saved={nowPlaying:row.nowPlaying,fetchedAt:Number(row.sourceFetchedAt||new Date(row.checkedAt).getTime())}}catch{}}
  if(saved)runtime.snapshots.set(userId,saved);
  return saved?.nowPlaying?{...saved.nowPlaying,stale:true,rateLimitedUntil:error?.backoffUntil||null}:null;
}

// These reads are shared by every open classroom browser. Caching them in the
// Next.js data cache prevents each student from consuming a separate Spotify
// API call every few seconds.
const cachedSpotifySearch=unstable_cache(loadSpotifySearch,['spotify-search-v1'],{revalidate:300});
const cachedSpotifyNowPlaying=unstable_cache(loadSpotifyNowPlaying,['spotify-now-playing-v3'],{revalidate:SPOTIFY_NOW_PLAYING_SECONDS});

export async function spotifySearch(userId,query,requesterId=userId){const now=Date.now(),last=Number(runtime.searches.get(requesterId)||0);if(now-last<SPOTIFY_SEARCH_COOLDOWN_MS){const error=new Error('Please wait 2 seconds before searching Spotify again');error.status=429;error.retryAfter=2;throw error}runtime.searches.set(requesterId,now);return cachedSpotifySearch(userId,String(query||'').trim().toLowerCase())}
export async function spotifyNowPlaying(userId){try{const snapshot=await cachedSpotifyNowPlaying(userId);await rememberNowPlaying(userId,snapshot);return snapshot.nowPlaying}catch(error){if(error.status===429)return lastNowPlaying(userId,error);throw error}}

export async function spotifyQueue(userId,uri){
  const add=()=>spotifyApi(userId,`v1/me/player/queue?uri=${encodeURIComponent(uri)}`,{method:'POST'});
  try{await add()}catch(error){
    if(error.status!==429||!error.retryAfter||error.retryAfter>3)throw error;
    await new Promise(resolve=>setTimeout(resolve,error.retryAfter*1000+200));
    await add();
  }
  return true;
}
