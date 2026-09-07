'use client';
import { useState } from 'react';
import { Database,Loader2,RefreshCw } from 'lucide-react';
import { Badge } from './UI';

function display(state,configured){
  if(state?.connected&&state.schemaReady&&state.core?.importedAt)return {tone:'green',label:`Ready · ${state.latencyMs} ms`,detail:`Core imported: ${state.core.users} users, ${state.core.groups} groups and ${state.core.memberships} memberships.`};
  if(state?.connected&&state.schemaReady)return {tone:'blue',label:`Schema ready · ${state.latencyMs} ms`,detail:'Connection works. Existing users and groups are not imported yet.'};
  if(state?.connected)return {tone:'amber',label:'Migration needed',detail:'Connection works, but the DevTrack database schema has not been applied yet.'};
  if(state&&!state.connected)return {tone:'red',label:'Connection failed',detail:'Check the Vercel environment scope and database connection string.'};
  if(configured)return {tone:'blue',label:'Configured',detail:'The connection string exists. Run a live check without exposing credentials.'};
  return {tone:'amber',label:'Not configured',detail:'Add DEVTRACK_DATABASE_URL in Vercel Environment Variables.'};
}

export default function DatabaseStatus({configured}){
  const [state,setState]=useState(null),[busy,setBusy]=useState(false),[initializing,setInitializing]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const view=display(state,configured);

  async function check(){
    setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/admin/database/status',{cache:'no-store'}),data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Status check failed');
      setState(data.database);
    }catch(error){
      setState({connected:false,schemaReady:false,latencyMs:null,core:null});
      setError(error.message||'Status check failed');
    }finally{
      setBusy(false);
    }
  }

  async function initialize(){
    if(!confirm('This applies pending Neon migrations and copies the current Blob users and groups. It does not delete Blob data or switch live storage. Continue?'))return;
    setInitializing(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/admin/database/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmation:'IMPORT_LEGACY_CORE'})}),data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Database initialization failed');
      setState(data.database);
      setMessage(`Imported ${data.imported.users} users, ${data.imported.groups} groups and ${data.imported.groupRelations} group relations.`);
    }catch(error){
      setError(error.message||'Database initialization failed');
    }finally{
      setInitializing(false);
    }
  }

  return <div className="database-status">
    <div className="setting-row"><span><Database size={15}/> Neon Postgres</span><Badge tone={view.tone}>{view.label}</Badge></div>
    <div className="database-status-detail"><p className={error?'database-status-error':''}>{error||message||view.detail}</p><div className="database-status-actions"><button className="btn secondary compact" onClick={check} disabled={busy||initializing||!configured}>{busy?<Loader2 className="spin" size={14}/>:<RefreshCw size={14}/>} Check</button><button className="btn primary compact" onClick={initialize} disabled={busy||initializing||!configured}>{initializing?<Loader2 className="spin" size={14}/>:<Database size={14}/>} {state?.core?.importedAt?'Sync core data':'Initialize & import'}</button></div></div>
  </div>;
}
