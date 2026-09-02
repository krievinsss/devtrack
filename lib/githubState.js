import 'server-only';
import crypto from 'node:crypto';

function stateSecret(){return process.env.AUTH_SECRET||'dev-only-change-this-secret-before-production'}

export function createGitHubState(payload){
  const body=Buffer.from(JSON.stringify({...payload,ts:Date.now()})).toString('base64url');
  const signature=crypto.createHmac('sha256',stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function readGitHubState(value){
  const [body,signature]=String(value||'').split('.');
  if(!body||!signature)throw new Error('Invalid GitHub state');
  const expected=crypto.createHmac('sha256',stateSecret()).update(body).digest('base64url');
  const a=Buffer.from(signature),b=Buffer.from(expected);
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))throw new Error('Invalid GitHub state');
  const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(Date.now()-Number(payload.ts||0)>15*60_000)throw new Error('GitHub state expired');
  return payload;
}
