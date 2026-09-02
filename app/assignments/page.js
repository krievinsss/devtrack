import { redirect } from 'next/navigation';
import { requirePageUser } from '@/lib/page';

export default async function Assignments(){
  await requirePageUser(['teacher','admin']);
  redirect('/projects');
}
