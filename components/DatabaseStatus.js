'use client';
import { useState } from 'react';
import { Database,Loader2,RefreshCw } from 'lucide-react';
import { Badge } from './UI';

function display(state,configured){
  if(state?.connected&&state.schemaReady)return {tone:'green',label:`Ready · ${state.latencyMs} ms`,detail:'Connection works and the DevTrack schema is migrated.'};
  if(state?.connected)return {tone:'amber',label:'Migration needed',detail:'Connection works, but the DevTrack database schema has not been applied yet.'};
  if(state&&!state.connected)return {tone:'red',label:'Connection failed',detail:'Check the Vercel environment scope and database connection string.'};
  if(configured)return {tone:'blue',label:'Configured',detail:'The connection string exists. Run a live check without exposing credentials.'};
  return {tone:'amber',label:'Not configured',detail:'Add DEVTRACK_DATABASE_URL in Vercel Environment Variables.'};
}

export default function DatabaseStatus({configured}){
  const [state,setState]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const view=display(state,configured);

  async function check(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/admin/database/status',{cache:'no-store'}),data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||'Status check failed');
      setState(data.database);
    }catch(error){
      setState({connected:false,schemaReady:false,latencyMs:null});
      setError(error.message||'Status check failed');
    }finally{
      setBusy(false);
    }
  }

  return <div className="database-status">
    <div className="setting-row"><span><Database size={15}/> Neon Postgres</span><Badge tone={view.tone}>{view.label}</Badge></div>
    <div className="database-status-detail"><p>{error||view.detail}</p><button className="btn secondary compact" onClick={check} disabled={busy||!configured}>{busy?<Loader2 className="spin" size={14}/>:<RefreshCw size={14}/>} Check connection</button></div>
  </div>;
}
