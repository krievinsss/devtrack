import { readJson } from '@/lib/storage';
export async function getUsers(){ return readJson('users',[]); }
export async function getStudents(){ return (await getUsers()).filter(u=>u.role==='student'); }
export async function getUser(id){ return (await getUsers()).find(u=>u.id===id)||null; }
