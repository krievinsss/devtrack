import 'server-only';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let cachedDatabase=null;

export function runtimeDatabaseUrl(){
  return firstEnvironmentValue('DEVTRACK_DATABASE_URL','DEVTRACK_POSTGRES_URL','DATABASE_URL','POSTGRES_URL');
}

export function migrationDatabaseUrl(){
  return firstEnvironmentValue('DEVTRACK_DATABASE_URL_UNPOOLED','DEVTRACK_POSTGRES_URL_NON_POOLING','DEVTRACK_POSTGRES_PRISMA_URL','DEVTRACK_DATABASE_URL','DATABASE_URL');
}

export function databaseConfigured(){return Boolean(runtimeDatabaseUrl())}

export function database(){
  const url=runtimeDatabaseUrl();
  if(!url)throw new Error('Neon Postgres is not configured');
  if(!cachedDatabase)cachedDatabase=drizzle(neon(url),{schema});
  return cachedDatabase;
}

export async function databaseStatus(){
  const url=runtimeDatabaseUrl();
  if(!url)return {configured:false,connected:false,schemaReady:false,latencyMs:null};
  const started=Date.now();
  try{
    const client=neon(url),rows=await client.query("select to_regclass('public.schools') is not null as schema_ready",[],{fetchOptions:{signal:AbortSignal.timeout(5000)}});
    return {configured:true,connected:true,schemaReady:Boolean(rows[0]?.schema_ready),latencyMs:Date.now()-started};
  }catch{
    return {configured:true,connected:false,schemaReady:false,latencyMs:Date.now()-started};
  }
}

function firstEnvironmentValue(...names){
  for(const name of names){const value=String(process.env[name]||'').trim();if(value)return value}
  return '';
}
