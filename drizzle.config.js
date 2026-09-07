import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({path:'.env.local',quiet:true});
config({path:'.env',quiet:true});

const url=process.env.DEVTRACK_DATABASE_URL_UNPOOLED||process.env.DEVTRACK_POSTGRES_URL_NON_POOLING||process.env.DEVTRACK_POSTGRES_PRISMA_URL||process.env.DEVTRACK_DATABASE_URL||process.env.DATABASE_URL||'postgresql://devtrack:devtrack@localhost:5432/devtrack';

export default defineConfig({
  schema:'./db/schema.js',
  out:'./db/migrations',
  dialect:'postgresql',
  dbCredentials:{url},
  strict:true,
  verbose:true
});
