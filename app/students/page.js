import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/page';

export default async function Students(){
  await requirePageUser(['teacher','admin']);
  redirect('/groups');
}
