import { redirect } from 'next/navigation';
import { currentUser } from './auth';

export async function requirePageUser(roles=[],moduleKey=null){
  const user=await currentUser();
  if(!user)redirect('/login');
  if(user.mustChangePassword)redirect('/change-password');
  if(roles.length&&!roles.includes(user.role))redirect('/dashboard');
  if(moduleKey&&!user.moduleKeys?.includes(moduleKey))redirect('/dashboard');
  return user;
}
