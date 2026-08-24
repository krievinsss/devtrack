import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import ChangePasswordForm from './ChangePasswordForm';

export default async function ChangePassword(){
  const user=await currentUser();
  if(!user)redirect('/login');
  return <main className="login-page"><div className="login-visual"><div className="visual-copy"><span className="eyebrow">ACCOUNT SECURITY</span><h2>Choose your own password.</h2><p>Your initial school password is temporary. Set a private password before continuing to DevTrack.</p></div></div><ChangePasswordForm user={user}/></main>;
}
