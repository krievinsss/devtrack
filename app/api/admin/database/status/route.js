import { databaseStatus } from '@/db/client';
import { fail,ok,requireApiUser } from '@/lib/http';

export async function GET(){
  const auth=await requireApiUser(['teacher','admin'],{permission:'administration.manage_school'});
  if(auth.error)return auth.error;

  try{
    return ok({database:await databaseStatus()});
  }catch{
    return fail('Database status check failed',500);
  }
}
