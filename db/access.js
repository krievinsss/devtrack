import { MODULE_CATALOG,PERMISSION_CATALOG,ROLE_PERMISSION_CATALOG } from './catalog.js';

function overrideMap(rows=[]){return new Map(rows.map(row=>[row.moduleKey??row.permissionKey,row.enabled??row.effect]))}

export function resolveModuleKeys({
  platformRole='user',
  schoolRole='student',
  modules=MODULE_CATALOG,
  schoolOverrides=[],
  membershipOverrides=[]
}={}){
  const school=overrideMap(schoolOverrides),membership=overrideMap(membershipOverrides);
  return modules.filter(module=>module.active!==false).filter(module=>{
    if(platformRole==='super_admin')return true;
    if(school.get(module.key)===false)return false;
    const roleDefault=schoolRole==='school_admin'||(schoolRole==='teacher'?module.defaultForTeacher:module.defaultForStudent);
    return membership.has(module.key)?membership.get(module.key)===true:roleDefault;
  }).map(module=>module.key);
}

export function resolvePermissionKeys({
  platformRole='user',
  schoolRole='student',
  enabledModuleKeys=[],
  permissionOverrides=[],
  permissionCatalog=PERMISSION_CATALOG
}={}){
  const enabled=new Set(enabledModuleKeys),overrides=overrideMap(permissionOverrides);
  const base=new Set(platformRole==='super_admin'?permissionCatalog.map(item=>item.key):(ROLE_PERMISSION_CATALOG[schoolRole]||[]));

  for(const [key,effect] of overrides){
    if(effect==='allow')base.add(key);
    if(effect==='deny')base.delete(key);
  }

  return permissionCatalog.filter(item=>enabled.has(item.moduleKey)&&base.has(item.key)).map(item=>item.key);
}

export function resolveAccess(input={}){
  const moduleKeys=resolveModuleKeys(input);
  const permissionKeys=resolvePermissionKeys({...input,enabledModuleKeys:moduleKeys});
  return {moduleKeys,permissionKeys,can:permission=>permissionKeys.includes(permission)};
}
