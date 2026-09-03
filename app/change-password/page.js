import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import ChangePasswordForm from './ChangePasswordForm';

export default async function ChangePassword(){
  const user=await currentUser();
  if(!user)redirect('/login');
  return <main className="login-page"><div className="login-visual"><div className="visual-copy"><span className="eyebrow">ACCOUNT SECURITY</span><h2>Keep your account private.</h2><p>Choose a password that is unique to your DevTrack account and is not shared with students.</p></div></div><ChangePasswordForm firstName={user.firstName} firstLogin={Boolean(user.mustChangePassword)} requiresCurrentPassword={Boolean(user.hasPassword&&!user.mustChangePassword)}/></main>;
}
