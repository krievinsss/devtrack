import { readJson,updateJson } from '@/lib/storage';
export async function getUsers(){ return readJson('users',[]); }
export async function getStudents(){ return (await getUsers()).filter(u=>u.role==='student'); }
export async function getUser(id){ return (await getUsers()).find(u=>u.id===id)||null; }
export async function patchUser(id,patch){let result=null;await updateJson('users',[],items=>items.map(u=>{if(u.id!==id)return u;result={...u,...patch};return result;}));return result;}
