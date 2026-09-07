import { getCoreUser,getCoreUsers,patchCoreUser } from '@/services/coreDirectory';
export async function getUsers(){ return (await getCoreUsers()).map(withoutCredentials); }
export async function getUsersWithCredentials(){return getCoreUsers()}
export async function getStudents(){ return (await getUsers()).filter(u=>u.role==='student'); }
export async function getUser(id){ return withoutCredentials(await getCoreUser(id)); }
export async function patchUser(id,patch,options){return withoutCredentials(await patchCoreUser(id,patch,options));}

function withoutCredentials(user){if(!user)return null;const {passwordHash,...safe}=user;return safe}
