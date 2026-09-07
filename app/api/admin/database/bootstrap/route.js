import { z } from 'zod';
import { bootstrapLegacyDatabase } from '@/db/bootstrap';
import { databaseStatus } from '@/db/client';
import { LegacyImportError } from '@/db/legacy';
import { teacherLoginEmail } from '@/lib/auth';
import { fail,ok,requireApiUser } from '@/lib/http';
import { readJson } from '@/lib/storage';
import { getUsers } from '@/services/users';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const bodySchema=z.object({confirmation:z.literal('IMPORT_LEGACY_CORE')});

export async function POST(req){
  const auth=await requireApiUser(['teacher','admin']);
  if(auth.error)return auth.error;
  const ownerEmail=teacherLoginEmail();
  if(String(auth.user.email||'').trim().toLowerCase()!==ownerEmail&&auth.user.role!=='admin')return fail('Only the DevTrack owner can initialize the database',403);
  if(process.env.VERCEL&&!process.env.BLOB_READ_WRITE_TOKEN&&!process.env.BLOB_STORE_ID)return fail('Vercel Blob is not configured, so the production source cannot be verified',409);

  try{
    bodySchema.parse(await req.json());
    const [legacyUsers,legacyGroups]=await Promise.all([getUsers(),readJson('groups',[])]);
    const imported=await bootstrapLegacyDatabase({
      legacyUsers,legacyGroups,ownerEmail,actorUserId:auth.user.id,
      school:{
        id:process.env.DEVTRACK_SCHOOL_ID||'school_vtdt',
        name:process.env.DEVTRACK_SCHOOL_NAME||'Vidzemes Tehnoloģiju un dizaina tehnikums',
        slug:process.env.DEVTRACK_SCHOOL_SLUG||'vtdt',
        timezone:'Europe/Riga'
      }
    });
    return ok({imported,database:await databaseStatus()});
  }catch(error){
    if(error instanceof z.ZodError)return fail('Invalid database initialization confirmation',400,error.issues);
    if(error instanceof LegacyImportError)return fail(error.message,400);
    console.error('Neon bootstrap failed',{actorUserId:auth.user.id,message:error?.message||'Unknown error'});
    return fail('Could not initialize Neon. Check the configured connection and try again.',500);
  }
}
