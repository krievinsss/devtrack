import crypto from 'node:crypto';
import { readJson, updateJson } from '@/lib/storage';

const ACCOUNTS_KEY = 'spotifyAccounts';
const SCOPES = ['user-read-playback-state','user-read-currently-playing','user-modify-playback-state'];

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

async function spotifyRaw(token,endpoint,options={}){
  const r=await fetch(`https://api.spotify.com/${endpoint}`,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})},cache:'no-store'});
  if(r.status===204) return null;
  const text=await r.text(); let d=null; try{d=text?JSON.parse(text):null}catch{d=text}
  if(!r.ok) throw new Error(d?.error?.message||d?.error_description||`Spotify API failed (${r.status})`);
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

export async function spotifySearch(userId,query){
  const d=await spotifyApi(userId,`v1/search?type=track&limit=8&q=${encodeURIComponent(query)}`);
  return (d?.tracks?.items||[]).map(t=>({id:t.id,uri:t.uri,title:t.name,artist:t.artists?.map(a=>a.name).join(', ')||'',album:t.album?.name||'',image:t.album?.images?.[1]?.url||t.album?.images?.[0]?.url||'',durationMs:t.duration_ms,explicit:!!t.explicit,spotifyUrl:t.external_urls?.spotify||''}));
}

export async function spotifyNowPlaying(userId){
  const d=await spotifyApi(userId,'v1/me/player/currently-playing');
  if(!d?.item) return null;
  return {id:d.item.id,title:d.item.name,artist:d.item.artists?.map(a=>a.name).join(', ')||'',image:d.item.album?.images?.[1]?.url||d.item.album?.images?.[0]?.url||'',durationMs:d.item.duration_ms,progressMs:d.progress_ms||0,isPlaying:!!d.is_playing,spotifyUrl:d.item.external_urls?.spotify||''};
}

export async function spotifyQueue(userId,uri){
  await spotifyApi(userId,`v1/me/player/queue?uri=${encodeURIComponent(uri)}`,{method:'POST'});
  return true;
}
