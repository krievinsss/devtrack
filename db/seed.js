import { platformModules,permissions,rolePermissions } from './schema.js';
import { MODULE_CATALOG,PERMISSION_CATALOG,ROLE_PERMISSION_CATALOG } from './catalog.js';

export async function seedAccessCatalog(db){
  await db.insert(platformModules).values(MODULE_CATALOG).onConflictDoNothing();
  await db.insert(permissions).values(PERMISSION_CATALOG).onConflictDoNothing();
  const roleRows=Object.entries(ROLE_PERMISSION_CATALOG).flatMap(([role,keys])=>keys.map(permissionKey=>({role,permissionKey})));
  await db.insert(rolePermissions).values(roleRows).onConflictDoNothing();
}
