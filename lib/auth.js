import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { getCoreUser,getCoreUserWithAccess } from '@/services/coreDirectory';

const COOKIE = 'devtrack_session';
function secret() { return new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-change-this-secret-before-production'); }

export async function createSession(user) {
  return new SignJWT({ sub: user.id, role: user.role, email: user.email, schoolId:user.schoolId||null, membershipId:user.membershipId||null, platformRole:user.platformRole||'user' })
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
export async function currentUserWithCredentials() {
  const session = await getSession(); if (!session?.sub) return null;
  const user=await getCoreUserWithAccess(session.sub);
  return user?.active===false?null:user;
}
export async function currentUser() {
  const user=await currentUserWithCredentials();
  if(!user)return null;
  const {passwordHash,...safe}=user;
  return {...safe,hasPassword:Boolean(passwordHash)};
}
export function teacherLoginEmail() {
  return (process.env.DEVTRACK_TEACHER_EMAIL || 'toms.ricards@vtdt.edu.lv').trim().toLowerCase();
}
export function verifyTeacherBootstrapPassword(input) {
  const expected = process.env.DEVTRACK_TEACHER_PASSWORD;
  if (!expected) return false;
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a,b);
}
export async function canAccessStudent(user,studentId){
  if(!user)return false;
  if(user.role==='admin'||user.id===studentId)return true;
  if(user.role!=='teacher')return false;
  const student=await getCoreUser(studentId);if(!student||student.role!=='student'||(user.schoolId&&student.schoolId&&user.schoolId!==student.schoolId))return false;
  const assigned=new Set(user.groupIds||[]);return(student.groupIds||[]).some(groupId=>assigned.has(groupId));
}
export function canAccessGroup(user,groupId){return Boolean(user&&(user.role==='admin'||(user.groupIds||[]).includes(groupId)))}
