import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const platformRole = pgEnum("platform_role", ["user", "super_admin"]);
export const schoolRole = pgEnum("school_role", [
  "school_admin",
  "teacher",
  "student",
]);
export const membershipStatus = pgEnum("membership_status", [
  "invited",
  "active",
  "suspended",
  "archived",
]);
export const groupRelation = pgEnum("group_relation", [
  "student",
  "teacher",
  "lead_teacher",
]);
export const permissionEffect = pgEnum("permission_effect", ["allow", "deny"]);
export const classroomAccessRole = pgEnum("classroom_access_role", [
  "viewer",
  "manager",
]);
export const attendanceSessionStatus = pgEnum("attendance_session_status", [
  "open",
  "closed",
  "cancelled",
]);
export const attendanceRecordStatus = pgEnum("attendance_record_status", [
  "present",
  "late",
  "absent",
  "excused",
]);

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .defaultNow()
    .notNull();

export const schools = pgTable(
  "schools",
  {
    id: text("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    timezone: varchar("timezone", { length: 80 })
      .default("Europe/Riga")
      .notNull(),
    active: boolean("active").default(true).notNull(),
    settings: jsonb("settings")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("schools_slug_lower_unique").on(sql`lower(${table.slug})`),
  ],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    passwordHash: text("password_hash"),
    platformRole: platformRole("platform_role").default("user").notNull(),
    active: boolean("active").default(true).notNull(),
    mustChangePassword: boolean("must_change_password")
      .default(false)
      .notNull(),
    profile: jsonb("profile")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
  ],
);

export const schoolMemberships = pgTable(
  "school_memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: schoolRole("role").notNull(),
    status: membershipStatus("status").default("active").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("school_memberships_school_user_unique").on(
      table.schoolId,
      table.userId,
    ),
    index("school_memberships_user_idx").on(table.userId),
    index("school_memberships_school_role_idx").on(table.schoolId, table.role),
  ],
);

export const platformModules = pgTable("platform_modules", {
  key: varchar("key", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").default("").notNull(),
  navigationPath: varchar("navigation_path", { length: 160 }),
  defaultForTeacher: boolean("default_for_teacher").default(false).notNull(),
  defaultForStudent: boolean("default_for_student").default(false).notNull(),
  sortOrder: integer("sort_order").default(100).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const permissions = pgTable(
  "permissions",
  {
    key: varchar("key", { length: 100 }).primaryKey(),
    moduleKey: varchar("module_key", { length: 64 })
      .notNull()
      .references(() => platformModules.key, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description").default("").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("permissions_module_idx").on(table.moduleKey)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    role: schoolRole("role").notNull(),
    permissionKey: varchar("permission_key", { length: 100 })
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.role, table.permissionKey],
      name: "role_permissions_pk",
    }),
  ],
);

export const schoolModuleAccess = pgTable(
  "school_module_access",
  {
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 64 })
      .notNull()
      .references(() => platformModules.key, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
    configuredByUserId: text("configured_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.schoolId, table.moduleKey],
      name: "school_module_access_pk",
    }),
    index("school_module_access_module_idx").on(table.moduleKey),
  ],
);

export const membershipModuleAccess = pgTable(
  "membership_module_access",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => schoolMemberships.id, { onDelete: "cascade" }),
    moduleKey: varchar("module_key", { length: 64 })
      .notNull()
      .references(() => platformModules.key, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull(),
    configuredByUserId: text("configured_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.membershipId, table.moduleKey],
      name: "membership_module_access_pk",
    }),
    index("membership_module_access_module_idx").on(table.moduleKey),
  ],
);

export const membershipPermissionOverrides = pgTable(
  "membership_permission_overrides",
  {
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => schoolMemberships.id, { onDelete: "cascade" }),
    permissionKey: varchar("permission_key", { length: 100 })
      .notNull()
      .references(() => permissions.key, { onDelete: "cascade" }),
    effect: permissionEffect("effect").notNull(),
    configuredByUserId: text("configured_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.membershipId, table.permissionKey],
      name: "membership_permission_overrides_pk",
    }),
  ],
);

export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    academicYear: varchar("academic_year", { length: 20 }),
    active: boolean("active").default(true).notNull(),
    externalRefs: jsonb("external_refs")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("groups_school_name_lower_unique").on(
      table.schoolId,
      sql`lower(${table.name})`,
    ),
    index("groups_school_idx").on(table.schoolId),
  ],
);

export const groupMemberships = pgTable(
  "group_memberships",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => schoolMemberships.id, { onDelete: "cascade" }),
    relation: groupRelation("relation").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.groupId, table.membershipId],
      name: "group_memberships_pk",
    }),
    index("group_memberships_membership_idx").on(table.membershipId),
    index("group_memberships_group_relation_idx").on(
      table.groupId,
      table.relation,
    ),
  ],
);

export const classrooms = pgTable(
  "classrooms",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    canvasWidth: integer("canvas_width").default(1000).notNull(),
    canvasHeight: integer("canvas_height").default(600).notNull(),
    version: integer("version").default(1).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("classrooms_school_slug_lower_unique").on(
      table.schoolId,
      sql`lower(${table.slug})`,
    ),
    index("classrooms_school_active_idx").on(table.schoolId, table.active),
    check(
      "classrooms_canvas_width_check",
      sql`${table.canvasWidth} between 400 and 3000`,
    ),
    check(
      "classrooms_canvas_height_check",
      sql`${table.canvasHeight} between 300 and 2000`,
    ),
    check("classrooms_version_check", sql`${table.version} > 0`),
  ],
);

export const classroomStaff = pgTable(
  "classroom_staff",
  {
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    membershipId: uuid("membership_id")
      .notNull()
      .references(() => schoolMemberships.id, { onDelete: "cascade" }),
    role: classroomAccessRole("role").default("viewer").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      columns: [table.classroomId, table.membershipId],
      name: "classroom_staff_pk",
    }),
    index("classroom_staff_membership_idx").on(table.membershipId),
  ],
);

export const desks = pgTable(
  "desks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(),
    label: varchar("label", { length: 80 }),
    x: integer("x").default(0).notNull(),
    y: integer("y").default(0).notNull(),
    width: integer("width").default(120).notNull(),
    height: integer("height").default(80).notNull(),
    qrToken: uuid("qr_token").defaultRandom().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("desks_classroom_code_lower_unique").on(
      table.classroomId,
      sql`lower(${table.code})`,
    ),
    uniqueIndex("desks_qr_token_unique").on(table.qrToken),
    index("desks_classroom_idx").on(table.classroomId),
    check("desks_position_check", sql`${table.x} >= 0 and ${table.y} >= 0`),
    check(
      "desks_size_check",
      sql`${table.width} between 60 and 360 and ${table.height} between 40 and 260`,
    ),
  ],
);

export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: text("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    classroomId: uuid("classroom_id")
      .notNull()
      .references(() => classrooms.id, { onDelete: "restrict" }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    teacherMembershipId: uuid("teacher_membership_id").references(
      () => schoolMemberships.id,
      { onDelete: "set null" },
    ),
    title: varchar("title", { length: 160 }).default("Lesson").notNull(),
    timetableLessons: jsonb("timetable_lessons")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    lessonCount: integer("lesson_count").default(1).notNull(),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    lateAfterMinutes: integer("late_after_minutes").default(10).notNull(),
    status: attendanceSessionStatus("status").default("open").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true, mode: "date" })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("attendance_sessions_school_start_idx").on(
      table.schoolId,
      table.startsAt,
    ),
    index("attendance_sessions_group_start_idx").on(
      table.groupId,
      table.startsAt,
    ),
    index("attendance_sessions_classroom_status_idx").on(
      table.classroomId,
      table.status,
    ),
    uniqueIndex("attendance_sessions_one_open_room_unique")
      .on(table.classroomId)
      .where(sql`${table.status} = 'open'`),
    check(
      "attendance_sessions_time_check",
      sql`${table.endsAt} > ${table.startsAt}`,
    ),
    check(
      "attendance_sessions_late_check",
      sql`${table.lateAfterMinutes} between 0 and 120`,
    ),
    check(
      "attendance_sessions_lesson_count_check",
      sql`${table.lessonCount} between 1 and 12`,
    ),
  ],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => attendanceSessions.id, { onDelete: "cascade" }),
    studentMembershipId: uuid("student_membership_id")
      .notNull()
      .references(() => schoolMemberships.id, { onDelete: "cascade" }),
    deskId: uuid("desk_id").references(() => desks.id, {
      onDelete: "set null",
    }),
    status: attendanceRecordStatus("status").notNull(),
    lessonStatuses: jsonb("lesson_statuses")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    checkedInAt: timestamp("checked_in_at", {
      withTimezone: true,
      mode: "date",
    }),
    markedByUserId: text("marked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    note: varchar("note", { length: 300 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("attendance_records_session_student_unique").on(
      table.sessionId,
      table.studentMembershipId,
    ),
    uniqueIndex("attendance_records_session_desk_unique")
      .on(table.sessionId, table.deskId)
      .where(sql`${table.deskId} is not null`),
    index("attendance_records_student_idx").on(
      table.studentMembershipId,
      table.createdAt,
    ),
    index("attendance_records_session_status_idx").on(
      table.sessionId,
      table.status,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    schoolId: text("school_id").references(() => schools.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 140 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }),
    entityId: text("entity_id"),
    metadata: jsonb("metadata")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_school_created_idx").on(table.schoolId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);
