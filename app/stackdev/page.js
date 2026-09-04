import AppShell from '@/components/AppShell';
import StackDevBoard from '@/components/StackDevBoard';
import { requirePageUser } from '@/lib/page';
import { getStackDevQuestions } from '@/services/stackdev';

export default async function StackDevPage(){
  const user=await requirePageUser(['student','teacher','admin']);
  const questions=await getStackDevQuestions();
  return <AppShell user={user}><StackDevBoard user={user} initialQuestions={questions}/></AppShell>;
}
