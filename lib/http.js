import { currentUser } from './auth';
export function ok(data, init={}) { return Response.json({ ok:true, ...data }, init); }
export function fail(message, status=400, details) { return Response.json({ ok:false, error:message, details }, { status }); }
export async function requireApiUser(roles=[]) {
  const user = await currentUser();
  if (!user) return { error: fail('Unauthorized',401) };
  if (roles.length && !roles.includes(user.role)) return { error: fail('Forbidden',403) };
  return { user };
}
