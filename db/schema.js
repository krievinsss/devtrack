import { sql } from 'drizzle-orm';
import { boolean,index,integer,jsonb,pgEnum,pgTable,primaryKey,text,timestamp,uniqueIndex,uuid,varchar } from 'drizzle-orm/pg-core';

export const platformRole=pgEnum('platform_role',['user','super_admin']);
export const schoolRole=pgEnum('school_role',['school_admin','teacher','student']);
export const membershipStatus=pgEnum('membership_status',['invited','active','suspended','archived']);
export const groupRelation=pgEnum('group_relation',['student','teacher','lead_teacher']);
export const permissionEffect=pgEnum('permission_effect',['allow','deny']);

const createdAt=()=>timestamp('created_at',{withTimezone:true,mode:'date'}).defaultNow().notNull();
const updatedAt=()=>timestamp('updated_at',{withTimezone:true,mode:'date'}).defaultNow().notNull();

export const schools=pgTable('schools',{
  id:text('id').primaryKey(),
  name:varchar('name',{length:160}).notNull(),
  slug:varchar('slug',{length:100}).notNull(),
  timezone:varchar('timezone',{length:80}).default('Europe/Riga').notNull(),
  active:boolean('active').default(true).notNull(),
  settings:jsonb('settings').default(sql`'{}'::jsonb`).notNull(),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  uniqueIndex('schools_slug_lower_unique').on(sql`lower(${table.slug})`)
]);

export const users=pgTable('users',{
  id:text('id').primaryKey(),
  email:varchar('email',{length:320}).notNull(),
  firstName:varchar('first_name',{length:100}).notNull(),
  lastName:varchar('last_name',{length:100}).notNull(),
  passwordHash:text('password_hash'),
  platformRole:platformRole('platform_role').default('user').notNull(),
  active:boolean('active').default(true).notNull(),
  mustChangePassword:boolean('must_change_password').default(false).notNull(),
  profile:jsonb('profile').default(sql`'{}'::jsonb`).notNull(),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`)
]);

export const schoolMemberships=pgTable('school_memberships',{
  id:uuid('id').defaultRandom().primaryKey(),
  schoolId:text('school_id').notNull().references(()=>schools.id,{onDelete:'cascade'}),
  userId:text('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  role:schoolRole('role').notNull(),
  status:membershipStatus('status').default('active').notNull(),
  isPrimary:boolean('is_primary').default(false).notNull(),
  joinedAt:timestamp('joined_at',{withTimezone:true,mode:'date'}).defaultNow().notNull(),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  uniqueIndex('school_memberships_school_user_unique').on(table.schoolId,table.userId),
  index('school_memberships_user_idx').on(table.userId),
  index('school_memberships_school_role_idx').on(table.schoolId,table.role)
]);

export const platformModules=pgTable('platform_modules',{
  key:varchar('key',{length:64}).primaryKey(),
  name:varchar('name',{length:120}).notNull(),
  description:text('description').default('').notNull(),
  navigationPath:varchar('navigation_path',{length:160}),
  defaultForTeacher:boolean('default_for_teacher').default(false).notNull(),
  defaultForStudent:boolean('default_for_student').default(false).notNull(),
  sortOrder:integer('sort_order').default(100).notNull(),
  active:boolean('active').default(true).notNull(),
  createdAt:createdAt(),
  updatedAt:updatedAt()
});

export const permissions=pgTable('permissions',{
  key:varchar('key',{length:100}).primaryKey(),
  moduleKey:varchar('module_key',{length:64}).notNull().references(()=>platformModules.key,{onDelete:'cascade'}),
  name:varchar('name',{length:160}).notNull(),
  description:text('description').default('').notNull(),
  createdAt:createdAt()
},table=>[
  index('permissions_module_idx').on(table.moduleKey)
]);

export const rolePermissions=pgTable('role_permissions',{
  role:schoolRole('role').notNull(),
  permissionKey:varchar('permission_key',{length:100}).notNull().references(()=>permissions.key,{onDelete:'cascade'}),
  createdAt:createdAt()
},table=>[
  primaryKey({columns:[table.role,table.permissionKey],name:'role_permissions_pk'})
]);

export const schoolModuleAccess=pgTable('school_module_access',{
  schoolId:text('school_id').notNull().references(()=>schools.id,{onDelete:'cascade'}),
  moduleKey:varchar('module_key',{length:64}).notNull().references(()=>platformModules.key,{onDelete:'cascade'}),
  enabled:boolean('enabled').notNull(),
  configuredByUserId:text('configured_by_user_id').references(()=>users.id,{onDelete:'set null'}),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  primaryKey({columns:[table.schoolId,table.moduleKey],name:'school_module_access_pk'}),
  index('school_module_access_module_idx').on(table.moduleKey)
]);

export const membershipModuleAccess=pgTable('membership_module_access',{
  membershipId:uuid('membership_id').notNull().references(()=>schoolMemberships.id,{onDelete:'cascade'}),
  moduleKey:varchar('module_key',{length:64}).notNull().references(()=>platformModules.key,{onDelete:'cascade'}),
  enabled:boolean('enabled').notNull(),
  configuredByUserId:text('configured_by_user_id').references(()=>users.id,{onDelete:'set null'}),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  primaryKey({columns:[table.membershipId,table.moduleKey],name:'membership_module_access_pk'}),
  index('membership_module_access_module_idx').on(table.moduleKey)
]);

export const membershipPermissionOverrides=pgTable('membership_permission_overrides',{
  membershipId:uuid('membership_id').notNull().references(()=>schoolMemberships.id,{onDelete:'cascade'}),
  permissionKey:varchar('permission_key',{length:100}).notNull().references(()=>permissions.key,{onDelete:'cascade'}),
  effect:permissionEffect('effect').notNull(),
  configuredByUserId:text('configured_by_user_id').references(()=>users.id,{onDelete:'set null'}),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  primaryKey({columns:[table.membershipId,table.permissionKey],name:'membership_permission_overrides_pk'})
]);

export const groups=pgTable('groups',{
  id:text('id').primaryKey(),
  schoolId:text('school_id').notNull().references(()=>schools.id,{onDelete:'cascade'}),
  name:varchar('name',{length:100}).notNull(),
  academicYear:varchar('academic_year',{length:20}),
  active:boolean('active').default(true).notNull(),
  externalRefs:jsonb('external_refs').default(sql`'{}'::jsonb`).notNull(),
  createdAt:createdAt(),
  updatedAt:updatedAt()
},table=>[
  uniqueIndex('groups_school_name_lower_unique').on(table.schoolId,sql`lower(${table.name})`),
  index('groups_school_idx').on(table.schoolId)
]);

export const groupMemberships=pgTable('group_memberships',{
  groupId:text('group_id').notNull().references(()=>groups.id,{onDelete:'cascade'}),
  membershipId:uuid('membership_id').notNull().references(()=>schoolMemberships.id,{onDelete:'cascade'}),
  relation:groupRelation('relation').notNull(),
  createdAt:createdAt()
},table=>[
  primaryKey({columns:[table.groupId,table.membershipId],name:'group_memberships_pk'}),
  index('group_memberships_membership_idx').on(table.membershipId),
  index('group_memberships_group_relation_idx').on(table.groupId,table.relation)
]);

export const auditLogs=pgTable('audit_logs',{
  id:uuid('id').defaultRandom().primaryKey(),
  schoolId:text('school_id').references(()=>schools.id,{onDelete:'set null'}),
  actorUserId:text('actor_user_id').references(()=>users.id,{onDelete:'set null'}),
  action:varchar('action',{length:140}).notNull(),
  entityType:varchar('entity_type',{length:100}),
  entityId:text('entity_id'),
  metadata:jsonb('metadata').default(sql`'{}'::jsonb`).notNull(),
  createdAt:createdAt()
},table=>[
  index('audit_logs_school_created_idx').on(table.schoolId,table.createdAt),
  index('audit_logs_entity_idx').on(table.entityType,table.entityId)
]);
