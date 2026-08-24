import { redirect } from 'next/navigation';import { currentUser } from './auth';
export async function requirePageUser(roles=[]){const user=await currentUser();if(!user)redirect('/login');if(roles.length&&!roles.includes(user.role))redirect('/dashboard');return user;}
