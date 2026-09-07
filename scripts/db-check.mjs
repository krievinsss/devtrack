import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';

config({path:'.env.local',quiet:true});
config({path:'.env',quiet:true});

const url=process.env.DEVTRACK_DATABASE_URL||process.env.DEVTRACK_POSTGRES_URL||process.env.DATABASE_URL;
if(!url){console.error('Database URL missing. Add DEVTRACK_DATABASE_URL to .env.local.');process.exit(1)}

try{
  const sql=neon(url),[result]=await sql`select current_database() as database, to_regclass('public.schools') is not null as schema_ready`;
  console.log(`Neon connection OK · database ${result.database} · schema ${result.schema_ready?'ready':'not migrated'}`);
  if(!result.schema_ready)process.exitCode=2;
}catch{
  console.error('Could not connect to Neon. Check the configured connection string and environment scope.');
  process.exitCode=1;
}
