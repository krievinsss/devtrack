import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import AppShell from '@/components/AppShell';
import DatabaseRecovery from '@/components/DatabaseRecovery';
import DatabaseStatus from '@/components/DatabaseStatus';
import { PageHeader,Badge } from '@/components/UI';
import { databaseConfigured } from '@/db/client';
import { requirePageUser } from '@/lib/page';

export default async function Settings(){
  const user=await requirePageUser(['teacher','admin'],'administration');
  const canManageAccess=user.permissionKeys?.includes('administration.manage_access'),canManageSchool=user.permissionKeys?.includes('administration.manage_school'),configured=databaseConfigured();
  const integrations=[['GitHub App',Boolean(process.env.GITHUB_APP_ID&&process.env.GITHUB_PRIVATE_KEY)],['OpenAI',Boolean(process.env.OPENAI_API_KEY)],['Deskplan',Boolean(process.env.DESKPLAN_API_KEY)],['Timetable API',true],['Vercel Blob',Boolean(process.env.BLOB_READ_WRITE_TOKEN||process.env.BLOB_STORE_ID)]];
  return <AppShell user={user}>
    <PageHeader eyebrow="Configuration" title="Settings & integrations" description="Secrets stay server-side in Vercel Environment Variables." actions={canManageAccess&&<Link className="btn primary" href="/settings/access"><ShieldCheck size={15}/> Teachers & Access</Link>}/>
    <div className="two-col"><section className="panel"><h3>Integrations</h3>{integrations.map(([name,on])=><div className="setting-row" key={name}><span>{name}</span><Badge tone={on?'green':'amber'}>{on?'Configured':'Not configured'}</Badge></div>)}<DatabaseStatus configured={configured}/></section><section className="panel"><h3>Account security</h3><div className="setting-row"><span>Signed in as</span><b>{user.email}</b></div><div className="setting-row"><span>Session cookie</span><Badge tone="green">HttpOnly</Badge></div><Link className="btn secondary wide" style={{marginTop:18}} href="/change-password">Change password</Link></section></div>
    {canManageSchool&&<DatabaseRecovery configured={configured}/>}
  </AppShell>;
}
