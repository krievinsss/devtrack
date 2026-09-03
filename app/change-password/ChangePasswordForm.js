'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';

export default function ChangePasswordForm({firstName,firstLogin,requiresCurrentPassword}){
  const router=useRouter();
  const [currentPassword,setCurrentPassword]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);

  async function submit(e){
    e.preventDefault();
    if(password!==confirm)return setError('Paroles nesakrīt');
    setBusy(true);setError('');
    const r=await fetch('/api/auth/change-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword,password})});
    const d=await r.json();setBusy(false);
    if(!r.ok)return setError(d.error||'Neizdevās nomainīt paroli');
    router.push(d.redirectTo||'/dashboard');router.refresh();
  }

  return <form className="login-card" onSubmit={submit}><div className="login-logo"><KeyRound size={22}/></div><div><span className="eyebrow">{firstLogin?'FIRST LOGIN':'ACCOUNT SECURITY'}</span><h1>Change password</h1><p>{firstName}, create a private password for your DevTrack account.</p></div>{requiresCurrentPassword&&<label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} /></label>}<label>New password<input type="password" autoComplete="new-password" minLength="8" required value={password} onChange={e=>setPassword(e.target.value)} /></label><label>Repeat password<input type="password" autoComplete="new-password" minLength="8" required value={confirm} onChange={e=>setConfirm(e.target.value)} /></label>{error&&<div className="form-error">{error}</div>}<button className="btn primary wide" disabled={busy}>{busy?'Saving…':'Save password'}</button></form>;
}
