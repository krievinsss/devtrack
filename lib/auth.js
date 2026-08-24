import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { readJson } from './storage';

const COOKIE = 'devtrack_session';
function secret() { return new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-change-this-secret-before-production'); }

export async function createSession(user) {
  return new SignJWT({ sub: user.id, role: user.role, email: user.email })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('12h').sign(secret());
}
export async function setSessionCookie(token) {
  const store = await cookies();
  store.set(COOKIE, token, { httpOnly:true, secure:process.env.NODE_ENV==='production', sameSite:'lax', path:'/', maxAge:43200 });
}
export async function clearSessionCookie() { (await cookies()).delete(COOKIE); }
export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try { return (await jwtVerify(token, secret())).payload; } catch { return null; }
}
export async function currentUser() {
  const session = await getSession(); if (!session?.sub) return null;
  const users = await readJson('users', []); return users.find(u => u.id === session.sub) || null;
}
export function verifyDemoPassword(input) {
  const expected = process.env.DEVTRACK_DEMO_PASSWORD || 'Demo123!';
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a,b);
}
export function canAccessStudent(user, studentId) {
  return user?.role === 'teacher' || user?.role === 'admin' || user?.id === studentId;
}
