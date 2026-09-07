import { currentUser } from './auth';
export function ok(data, init={}) { return Response.json({ ok:true, ...data }, init); }
export function fail(message, status=400, details) { return Response.json({ ok:false, error:message, details }, { status }); }
export async function requireApiUser(roles=[],options={}) {
  let user;
  try{user=await currentUser()}catch(error){console.error('Authentication storage unavailable',{message:error?.message||'Unknown error'});return{error:fail('Service temporarily unavailable',503)}}
  if (!user) return { error: fail('Unauthorized',401) };
  if (roles.length && !roles.includes(user.role)) return { error: fail('Forbidden',403) };
  if(options.module&&!user.moduleKeys?.includes(options.module))return {error:fail('Module access is disabled',403)};
  if(options.permission&&!user.permissionKeys?.includes(options.permission))return {error:fail('Forbidden',403)};
  return { user };
}
