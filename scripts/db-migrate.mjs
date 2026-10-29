import { config } from 'dotenv';
import ws from 'ws';
import { Pool,neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { seedAccessCatalog } from '../db/seed.js';
import { assertDemoEnvironmentIsolated } from './demoEnvironment.mjs';

const demoMode=process.argv.includes('--demo');
if(demoMode){
  config({path:'.env.demo.local',override:true,quiet:true});
  process.env.DEVTRACK_DEMO_MODE='true';
  await assertDemoEnvironmentIsolated();
}else{
  config({path:'.env.local',quiet:true});
  config({path:'.env',quiet:true});
}

const url=demoMode
  ? process.env.DEVTRACK_DEMO_DATABASE_URL_UNPOOLED||process.env.DEVTRACK_DEMO_DATABASE_URL
  : process.env.DEVTRACK_DATABASE_URL_UNPOOLED||process.env.DEVTRACK_POSTGRES_URL_NON_POOLING||process.env.DEVTRACK_POSTGRES_PRISMA_URL||process.env.DEVTRACK_DATABASE_URL||process.env.DATABASE_URL;
if(!url){console.error(demoMode?'Demo database URL missing. Configure DEVTRACK_DEMO_DATABASE_URL in .env.demo.local.':'Database URL missing. Add DEVTRACK_DATABASE_URL_UNPOOLED or DEVTRACK_DATABASE_URL to .env.local.');process.exit(1)}

neonConfig.webSocketConstructor=ws;
const pool=new Pool({connectionString:url});
try{
  const db=drizzle(pool);
  await migrate(db,{migrationsFolder:'./db/migrations'});
  await db.transaction(async tx=>seedAccessCatalog(tx));
  console.log(`DevTrack ${demoMode?'demo ':''}database migrations and access catalog are up to date.`);
}finally{
  await pool.end();
}
