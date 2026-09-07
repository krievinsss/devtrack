import { sql } from 'drizzle-orm';
import { platformModules,permissions,rolePermissions } from './schema.js';
import { MODULE_CATALOG,PERMISSION_CATALOG,ROLE_PERMISSION_CATALOG } from './catalog.js';

export async function seedAccessCatalog(db){
  await db.insert(platformModules).values(MODULE_CATALOG).onConflictDoUpdate({target:platformModules.key,set:{name:excluded(platformModules.name),description:excluded(platformModules.description),navigationPath:excluded(platformModules.navigationPath),defaultForTeacher:excluded(platformModules.defaultForTeacher),defaultForStudent:excluded(platformModules.defaultForStudent),sortOrder:excluded(platformModules.sortOrder),active:excluded(platformModules.active),updatedAt:excluded(platformModules.updatedAt)}});
  await db.insert(permissions).values(PERMISSION_CATALOG).onConflictDoUpdate({target:permissions.key,set:{moduleKey:excluded(permissions.moduleKey),name:excluded(permissions.name),description:excluded(permissions.description)}});
  const roleRows=Object.entries(ROLE_PERMISSION_CATALOG).flatMap(([role,keys])=>keys.map(permissionKey=>({role,permissionKey})));
  await db.delete(rolePermissions);
  if(roleRows.length)await db.insert(rolePermissions).values(roleRows);
}

function excluded(column){return sql.raw(`excluded."${String(column.name).replaceAll('"','""')}"`)}
