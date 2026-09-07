import 'server-only';
import path from 'node:path';
import { Client,neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { importLegacyCore } from './legacy.js';
import * as schema from './schema.js';

const LOCK_ID=16092026;

export async function bootstrapLegacyDatabase(input){
  const url=migrationUrl();
  if(!url)throw new Error('Neon Postgres is not configured');
  neonConfig.webSocketConstructor=ws;
  const client=new Client({connectionString:url,connectionTimeoutMillis:10000});
  let connected=false,locked=false;
  try{
    await client.connect();connected=true;
    await client.query(`select pg_advisory_lock(${LOCK_ID})`);
    locked=true;
    const db=drizzle(client,{schema});
    await migrate(db,{migrationsFolder:path.join(process.cwd(),'db','migrations')});
    return await db.transaction(tx=>importLegacyCore(tx,input));
  }finally{
    if(locked)try{await client.query(`select pg_advisory_unlock(${LOCK_ID})`)}catch{}
    if(connected)await client.end();
  }
}

function migrationUrl(){
  for(const name of ['DEVTRACK_DATABASE_URL_UNPOOLED','DEVTRACK_POSTGRES_URL_NON_POOLING','DEVTRACK_POSTGRES_PRISMA_URL','DEVTRACK_DATABASE_URL','DEVTRACK_POSTGRES_URL','DATABASE_URL']){
    const value=String(process.env[name]||'').trim();if(value)return value;
  }
  return '';
}
