'use client';
import { useMemo,useState } from 'react';
import { Badge } from './UI';
import { Check,CheckCircle2,ChevronRight,Copy,KeyRound,Layers3,LockKeyhole,Pencil,Plus,Search,ShieldCheck,UserRoundCog,UsersRound,X } from 'lucide-react';

const endpoint='/api/admin/access';

async function mutate(body){
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',body:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Operation failed');
  return data;
}

export default function TeacherAccessManager({initialSnapshot,viewer}){
  const [staff,setStaff]=useState(initialSnapshot.staff||[]),[groups,setGroups]=useState(initialSnapshot.groups||[]),[catalog,setCatalog]=useState(initialSnapshot.catalog);
  const [selectedId,setSelectedId]=useState(initialSnapshot.staff?.find(item=>item.id!==viewer.id)?.id||initialSnapshot.staff?.[0]?.id||'');
  const [query,setQuery]=useState(''),[editor,setEditor]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[credentials,setCredentials]=useState(null);
  const selected=staff.find(item=>item.id===selectedId)||staff[0]||null;
  const filtered=useMemo(()=>{const needle=query.trim().toLowerCase();return needle?staff.filter(item=>`${item.firstName} ${item.lastName} ${item.email}`.toLowerCase().includes(needle)):staff},[query,staff]);
  const activeCount=staff.filter(item=>item.active).length,adminCount=staff.filter(item=>item.schoolRole==='school_admin').length,coveredGroups=new Set(staff.flatMap(item=>item.groupIds||[])).size;

  function applySnapshot(data){setStaff(data.staff||[]);setGroups(data.groups||[]);if(data.catalog)setCatalog(data.catalog)}
  function openNew(){setError('');setNotice('');setEditor(newStaffForm(catalog))}
  function openEdit(item){setError('');setNotice('');setEditor({...item,moduleKeys:[...(item.moduleKeys||[])],permissionKeys:[...(item.permissionKeys||[])]})}
  function canEdit(item){return item&&item.platformRole!=='super_admin'&&item.id!==viewer.id&&(viewer.platformRole==='super_admin'||item.schoolRole==='teacher')}
  async function save(form){
    if(busy)return;
    const creating=!form.id,previous=staff,optimistic={...form,id:form.id||`pending_${Date.now()}`,platformRole:'user',role:form.schoolRole==='school_admin'?'admin':'teacher',mustChangePassword:creating,updatedAt:new Date().toISOString()};
    setBusy(creating?'create':form.id);setError('');setNotice('');setEditor(null);
    if(creating){setStaff(items=>[...items,optimistic]);setSelectedId(optimistic.id)}else setStaff(items=>items.map(item=>item.id===form.id?{...item,...optimistic}:item));
    try{
      const data=await mutate({action:creating?'create':'update',staff:form});
      applySnapshot(data);setSelectedId(data.createdId||data.updatedId||form.id);
      if(data.temporaryPassword)setCredentials({name:`${form.firstName} ${form.lastName}`,password:data.temporaryPassword});
      setNotice(creating?'Teacher account created.':'Access changes saved.');
    }catch(cause){setStaff(previous);setSelectedId(form.id||previous[0]?.id||'');setEditor(form);setError(cause.message)}finally{setBusy('')}
  }
  async function resetPassword(item){
    if(!canEdit(item)||busy||!confirm(`Reset temporary password for ${item.firstName} ${item.lastName}?`))return;
    setBusy(item.id);setError('');setNotice('');
    try{const data=await mutate({action:'resetPassword',id:item.id});applySnapshot(data);setCredentials({name:`${item.firstName} ${item.lastName}`,password:data.temporaryPassword});setNotice('Temporary password generated.')}catch(cause){setError(cause.message)}finally{setBusy('')}
  }

  return <div className="access-manager">
    {(error||notice)&&<div className={`notice ${error?'danger':''}`}>{error||notice}</div>}
    <div className="access-stats">
      <Metric icon={UserRoundCog} label="Staff accounts" value={staff.length}/>
      <Metric icon={CheckCircle2} label="Active" value={activeCount} tone="green"/>
      <Metric icon={UsersRound} label="Groups covered" value={`${coveredGroups}/${groups.length}`}/>
      <Metric icon={ShieldCheck} label="Administrators" value={adminCount}/>
    </div>
    <div className="access-toolbar">
      <label className="access-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search teachers…"/></label>
      <button className="btn primary" onClick={openNew}><Plus size={15}/> Add teacher</button>
    </div>
    <div className="access-workspace">
      <section className="panel access-directory">
        <div className="access-directory-head"><span>School staff</span><Badge>{filtered.length}</Badge></div>
        <div className="access-people">{filtered.map(item=><button key={item.id} className={`access-person ${selected?.id===item.id?'selected':''}`} onClick={()=>setSelectedId(item.id)}>
          <span className="access-avatar">{item.firstName?.[0]}{item.lastName?.[0]}</span>
          <span className="access-person-copy"><b>{item.firstName} {item.lastName}</b><small>{item.email}</small><span><i className={item.active?'active':''}/>{item.active?'Active':'Suspended'} · {roleName(item)}</span></span>
          {item.platformRole==='super_admin'?<LockKeyhole size={15}/>:<ChevronRight size={15}/>}
        </button>)}{!filtered.length&&<div className="access-empty"><Search size={20}/><p>No matching teachers.</p></div>}</div>
      </section>
      <section className="panel access-detail">{selected?<>
        <div className="access-detail-head"><div className="access-identity"><span className="access-avatar large">{selected.firstName?.[0]}{selected.lastName?.[0]}</span><div><div className="access-title-row"><h2>{selected.firstName} {selected.lastName}</h2>{selected.platformRole==='super_admin'&&<Badge tone="purple">Superadmin</Badge>}</div><p>{selected.email}</p></div></div><div className="access-head-actions">{canEdit(selected)&&<><button className="btn secondary" disabled={busy===selected.id} onClick={()=>resetPassword(selected)}><KeyRound size={14}/> Reset password</button><button className="btn primary" onClick={()=>openEdit(selected)}><Pencil size={14}/> Edit access</button></>}</div></div>
        {selected.platformRole==='super_admin'&&<div className="access-protected"><LockKeyhole size={17}/><div><b>Protected platform owner</b><span>This account always retains every module and permission, preventing an accidental lockout.</span></div></div>}
        <div className="access-overview-grid">
          <Overview title="Account" icon={UserRoundCog}><Info label="Role" value={roleName(selected)}/><Info label="Status" value={selected.active?'Active':'Suspended'} tone={selected.active?'green':'red'}/><Info label="Password" value={selected.mustChangePassword?'Change required':'Set'}/></Overview>
          <Overview title="Assigned groups" icon={UsersRound}>{selected.schoolRole==='school_admin'?<p className="access-muted">School administrators can access every group.</p>:<ChipList items={(selected.groupIds||[]).map(id=>groups.find(group=>group.id===id)?.name||id)} empty="No groups assigned"/>}</Overview>
        </div>
        <div className="access-section-head"><div><span className="eyebrow">Workspace</span><h3>Enabled modules</h3></div><Badge tone="purple">{selected.moduleKeys?.length||0} modules</Badge></div>
        <div className="access-module-summary">{catalog.modules.filter(module=>selected.moduleKeys?.includes(module.key)).map(module=><div key={module.key}><span className="access-module-icon"><Layers3 size={14}/></span><span><b>{module.name}</b><small>{selected.permissionKeys?.filter(key=>module.permissions.some(permission=>permission.key===key)).length||0} permissions</small></span></div>)}</div>
        {!selected.moduleKeys?.length&&<div className="access-empty compact"><Layers3 size={20}/><p>No modules enabled.</p></div>}
      </>:<div className="access-empty"><UserRoundCog size={24}/><p>Add the first teacher account.</p></div>}</section>
    </div>
    <>{editor&&<AccessDrawer value={editor} groups={groups} catalog={catalog} viewer={viewer} saving={Boolean(busy)} onChange={setEditor} onClose={()=>setEditor(null)} onSave={()=>save(editor)}/>}</>
    <>{credentials&&<CredentialModal value={credentials} onClose={()=>setCredentials(null)}/>}</>
  </div>;
}

function Metric({icon:Icon,label,value,tone=''}){return <div className={`access-metric ${tone}`}><span><Icon size={16}/></span><div><b>{value}</b><small>{label}</small></div></div>}
function roleName(item){return item.platformRole==='super_admin'?'Platform owner':item.schoolRole==='school_admin'?'School administrator':'Teacher'}
function Overview({title,icon:Icon,children}){return <div className="access-overview"><div className="access-overview-title"><Icon size={15}/><b>{title}</b></div>{children}</div>}
function Info({label,value,tone=''}){return <div className="access-info"><span>{label}</span><b className={tone}>{value}</b></div>}
function ChipList({items,empty}){return items.length?<div className="access-chips">{items.map(item=><span key={item}>{item}</span>)}</div>:<p className="access-muted">{empty}</p>}

function AccessDrawer({value,groups,catalog,viewer,saving,onChange,onClose,onSave}){
  const isNew=!value.id,canChooseAdmin=viewer.platformRole==='super_admin',selectedModules=new Set(value.moduleKeys||[]),selectedPermissions=new Set(value.permissionKeys||[]);
  const update=patch=>onChange({...value,...patch});
  function changeRole(schoolRole){const modules=schoolRole==='school_admin'?catalog.modules.filter(item=>item.schoolEnabled).map(item=>item.key):(value.moduleKeys||[]).filter(key=>key!=='administration');update({schoolRole,moduleKeys:modules,permissionKeys:defaultPermissions(catalog,schoolRole,modules)})}
  function applyPreset(name){const modules=(name==='full'?catalog.modules.map(item=>item.key):catalog.presets[name]||[]).filter(key=>catalog.modules.find(item=>item.key===key)?.schoolEnabled&&!(value.schoolRole==='teacher'&&key==='administration'));update({moduleKeys:modules,permissionKeys:defaultPermissions(catalog,value.schoolRole,modules)})}
  function toggleModule(key){const modules=selectedModules.has(key)?value.moduleKeys.filter(item=>item!==key):[...value.moduleKeys,key];const allowed=new Set(catalog.modules.filter(item=>modules.includes(item.key)).flatMap(item=>item.permissions.map(permission=>permission.key))),defaults=defaultPermissions(catalog,value.schoolRole,modules);const permissions=selectedModules.has(key)?value.permissionKeys.filter(item=>allowed.has(item)):[...new Set([...value.permissionKeys,...defaults.filter(item=>catalog.modules.find(module=>module.key===key)?.permissions.some(permission=>permission.key===item))])];update({moduleKeys:modules,permissionKeys:permissions})}
  function togglePermission(key){update({permissionKeys:selectedPermissions.has(key)?value.permissionKeys.filter(item=>item!==key):[...value.permissionKeys,key]})}
  function toggleGroup(id){update({groupIds:(value.groupIds||[]).includes(id)?value.groupIds.filter(item=>item!==id):[...value.groupIds,id]})}
  const valid=value.firstName?.trim()&&value.lastName?.trim()&&/^\S+@\S+\.\S+$/.test(value.email||'');
  return <div className="access-drawer-backdrop" onMouseDown={onClose}><aside className="access-drawer" onMouseDown={event=>event.stopPropagation()}>
    <header><div><span className="eyebrow">{isNew?'New account':'Access profile'}</span><h2>{isNew?'Add teacher':`${value.firstName} ${value.lastName}`}</h2></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></header>
    <div className="access-drawer-body">
      <section className="access-form-section"><div className="access-form-heading"><span>01</span><div><h3>Account details</h3><p>Name, sign-in email, role and account status.</p></div></div><div className="form-grid"><div className="field"><label>First name</label><input value={value.firstName||''} onChange={event=>update({firstName:event.target.value})}/></div><div className="field"><label>Last name</label><input value={value.lastName||''} onChange={event=>update({lastName:event.target.value})}/></div><div className="field span-2"><label>Email</label><input type="email" value={value.email||''} onChange={event=>update({email:event.target.value})}/></div></div>
        <div className="access-role-options"><button className={value.schoolRole==='teacher'?'selected':''} onClick={()=>changeRole('teacher')}><UserRoundCog size={16}/><span><b>Teacher</b><small>Only assigned groups and enabled tools</small></span>{value.schoolRole==='teacher'&&<Check size={15}/>}</button>{canChooseAdmin&&<button className={value.schoolRole==='school_admin'?'selected':''} onClick={()=>changeRole('school_admin')}><ShieldCheck size={16}/><span><b>School admin</b><small>School-wide administration access</small></span>{value.schoolRole==='school_admin'&&<Check size={15}/>}</button>}</div>
        {!isNew&&<button className={`access-status-toggle ${value.active?'on':''}`} onClick={()=>update({active:!value.active})}><span className="access-switch"><i/></span><span><b>{value.active?'Account active':'Account suspended'}</b><small>{value.active?'The teacher can sign in.':'Sign-in is blocked until reactivated.'}</small></span></button>}
      </section>
      {value.schoolRole==='teacher'&&<section className="access-form-section"><div className="access-form-heading"><span>02</span><div><h3>Assigned groups</h3><p>The teacher only sees students belonging to these groups.</p></div></div><div className="access-choice-grid">{groups.map(group=><button key={group.id} className={(value.groupIds||[]).includes(group.id)?'selected':''} onClick={()=>toggleGroup(group.id)}><span className="access-check">{(value.groupIds||[]).includes(group.id)&&<Check size={13}/>}</span><b>{group.name}</b></button>)}</div>{!groups.length&&<p className="access-muted">Create groups before assigning them to teachers.</p>}</section>}
      <section className="access-form-section"><div className="access-form-heading"><span>{value.schoolRole==='teacher'?'03':'02'}</span><div><h3>Modules & permissions</h3><p>Choose a preset, then fine-tune individual actions.</p></div></div><div className="access-presets"><button onClick={()=>applyPreset('general')}>Core classroom</button><button onClick={()=>applyPreset('programming')}>Programming</button>{value.schoolRole==='school_admin'&&<button onClick={()=>applyPreset('full')}>Full school</button>}</div>
        <div className="access-module-editor">{catalog.modules.map(module=>{const enabled=selectedModules.has(module.key),blocked=!module.schoolEnabled||(value.schoolRole==='teacher'&&module.key==='administration');return <div className={`access-module-card ${enabled?'enabled':''} ${blocked?'blocked':''}`} key={module.key}><button className="access-module-toggle" disabled={blocked} onClick={()=>toggleModule(module.key)}><span className="access-module-icon"><Layers3 size={15}/></span><span><b>{module.name}</b><small>{blocked&&module.key==='administration'?'Reserved for school administrators':module.description}</small></span><span className={`access-switch ${enabled?'on':''}`}><i/></span></button>{enabled&&module.permissions.length>0&&<div className="access-permissions">{module.permissions.map(permission=><button key={permission.key} className={selectedPermissions.has(permission.key)?'selected':''} onClick={()=>togglePermission(permission.key)}><span className="access-check">{selectedPermissions.has(permission.key)&&<Check size={12}/>}</span><span><b>{permission.name}</b><small>{permission.key}</small></span></button>)}</div>}</div>})}</div>
      </section>
    </div>
    <footer><div><b>{value.moduleKeys?.length||0}</b> modules · <b>{value.permissionKeys?.filter(key=>catalog.modules.some(module=>value.moduleKeys?.includes(module.key)&&module.permissions.some(permission=>permission.key===key))).length||0}</b> permissions</div><span><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!valid||saving} onClick={onSave}>{saving?'Saving…':isNew?'Create teacher':'Save access'}</button></span></footer>
  </aside></div>;
}

function CredentialModal({value,onClose}){const [copied,setCopied]=useState(false);async function copy(){await navigator.clipboard.writeText(value.password);setCopied(true)}return <div className="modal-backdrop access-credential-backdrop" onMouseDown={onClose}><div className="access-credential" onMouseDown={event=>event.stopPropagation()}><span className="access-credential-icon"><KeyRound size={24}/></span><h2>Temporary password</h2><p>Share this once with <b>{value.name}</b>. A password change will be required after sign-in.</p><button className="access-password" onClick={copy}><code>{value.password}</code>{copied?<Check size={17}/>:<Copy size={17}/>}</button><button className="btn primary wide" onClick={onClose}>Done</button></div></div>}

function newStaffForm(catalog){const modules=(catalog.presets.general||[]).filter(key=>catalog.modules.find(item=>item.key===key)?.schoolEnabled);return{firstName:'',lastName:'',email:'',schoolRole:'teacher',active:true,groupIds:[],moduleKeys:modules,permissionKeys:defaultPermissions(catalog,'teacher',modules)}}
function defaultPermissions(catalog,role,moduleKeys){const modules=new Set(moduleKeys);return(catalog.roleDefaults[role]||[]).filter(key=>catalog.modules.some(module=>modules.has(module.key)&&module.permissions.some(permission=>permission.key===key)))}
