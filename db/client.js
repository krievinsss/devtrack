import 'server-only';
import { Client,neon,neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleServerless } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
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
  if(!cachedDatabase)cachedDatabase=drizzleHttp(neon(url),{schema});
  return cachedDatabase;
}

export async function withTransactionDatabase(operation){
  const url=migrationDatabaseUrl();if(!url)throw new Error('Neon Postgres is not configured');
  neonConfig.webSocketConstructor=ws;
  const client=new Client({connectionString:url,connectionTimeoutMillis:10000});
  let connected=false;
  try{
    await client.connect();connected=true;
    return await operation(drizzleServerless(client,{schema}));
  }finally{if(connected)await client.end()}
}

export async function databaseStatus(){
  const url=runtimeDatabaseUrl();
  if(!url)return {configured:false,connected:false,schemaReady:false,latencyMs:null,core:null};
  const started=Date.now();
  try{
    const client=neon(url),rows=await client.query("select to_regclass('public.schools') is not null as schema_ready",[],{fetchOptions:{signal:AbortSignal.timeout(5000)}});
    const schemaReady=Boolean(rows[0]?.schema_ready);
    let core=null;
    if(schemaReady){
      const [counts]=await client.query("select (select count(*) from schools)::int as schools, (select count(*) from users)::int as users, (select count(*) from school_memberships)::int as memberships, (select count(*) from groups)::int as groups, (select max(created_at) from audit_logs where action = 'legacy.core_imported') as imported_at",[],{fetchOptions:{signal:AbortSignal.timeout(5000)}});
      core={schools:Number(counts?.schools||0),users:Number(counts?.users||0),memberships:Number(counts?.memberships||0),groups:Number(counts?.groups||0),importedAt:counts?.imported_at?new Date(counts.imported_at).toISOString():null};
    }
    return {configured:true,connected:true,schemaReady,latencyMs:Date.now()-started,core};
  }catch{
    return {configured:true,connected:false,schemaReady:false,latencyMs:Date.now()-started,core:null};
  }
}

function firstEnvironmentValue(...names){
  for(const name of names){const value=String(process.env[name]||'').trim();if(value)return value}
  return '';
}
