CREATE TYPE "public"."group_relation" AS ENUM('student', 'teacher', 'lead_teacher');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('invited', 'active', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."permission_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."platform_role" AS ENUM('user', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."school_role" AS ENUM('school_admin', 'teacher', 'student');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text,
	"actor_user_id" text,
	"action" varchar(140) NOT NULL,
	"entity_type" varchar(100),
	"entity_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_memberships" (
	"group_id" text NOT NULL,
	"membership_id" uuid NOT NULL,
	"relation" "group_relation" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_memberships_pk" PRIMARY KEY("group_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" varchar(100) NOT NULL,
	"academic_year" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"external_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_module_access" (
	"membership_id" uuid NOT NULL,
	"module_key" varchar(64) NOT NULL,
	"enabled" boolean NOT NULL,
	"configured_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_module_access_pk" PRIMARY KEY("membership_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "membership_permission_overrides" (
	"membership_id" uuid NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"effect" "permission_effect" NOT NULL,
	"configured_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_permission_overrides_pk" PRIMARY KEY("membership_id","permission_key")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"module_key" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_modules" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"navigation_path" varchar(160),
	"default_for_teacher" boolean DEFAULT false NOT NULL,
	"default_for_student" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role" "school_role" NOT NULL,
	"permission_key" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role","permission_key")
);
--> statement-breakpoint
CREATE TABLE "school_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "school_role" NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_module_access" (
	"school_id" text NOT NULL,
	"module_key" varchar(64) NOT NULL,
	"enabled" boolean NOT NULL,
	"configured_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "school_module_access_pk" PRIMARY KEY("school_id","module_key")
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"timezone" varchar(80) DEFAULT 'Europe/Riga' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password_hash" text,
	"platform_role" "platform_role" DEFAULT 'user' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_membership_id_school_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_module_access" ADD CONSTRAINT "membership_module_access_membership_id_school_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_module_access" ADD CONSTRAINT "membership_module_access_module_key_platform_modules_key_fk" FOREIGN KEY ("module_key") REFERENCES "public"."platform_modules"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_module_access" ADD CONSTRAINT "membership_module_access_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_permission_overrides" ADD CONSTRAINT "membership_permission_overrides_membership_id_school_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_permission_overrides" ADD CONSTRAINT "membership_permission_overrides_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_permission_overrides" ADD CONSTRAINT "membership_permission_overrides_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_module_key_platform_modules_key_fk" FOREIGN KEY ("module_key") REFERENCES "public"."platform_modules"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_key_permissions_key_fk" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_memberships" ADD CONSTRAINT "school_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_module_access" ADD CONSTRAINT "school_module_access_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_module_access" ADD CONSTRAINT "school_module_access_module_key_platform_modules_key_fk" FOREIGN KEY ("module_key") REFERENCES "public"."platform_modules"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_module_access" ADD CONSTRAINT "school_module_access_configured_by_user_id_users_id_fk" FOREIGN KEY ("configured_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_school_created_idx" ON "audit_logs" USING btree ("school_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "group_memberships_membership_idx" ON "group_memberships" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "group_memberships_group_relation_idx" ON "group_memberships" USING btree ("group_id","relation");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_school_name_lower_unique" ON "groups" USING btree ("school_id",lower("name"));--> statement-breakpoint
CREATE INDEX "groups_school_idx" ON "groups" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "membership_module_access_module_idx" ON "membership_module_access" USING btree ("module_key");--> statement-breakpoint
CREATE INDEX "permissions_module_idx" ON "permissions" USING btree ("module_key");--> statement-breakpoint
CREATE UNIQUE INDEX "school_memberships_school_user_unique" ON "school_memberships" USING btree ("school_id","user_id");--> statement-breakpoint
CREATE INDEX "school_memberships_user_idx" ON "school_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "school_memberships_school_role_idx" ON "school_memberships" USING btree ("school_id","role");--> statement-breakpoint
CREATE INDEX "school_module_access_module_idx" ON "school_module_access" USING btree ("module_key");--> statement-breakpoint
CREATE UNIQUE INDEX "schools_slug_lower_unique" ON "schools" USING btree (lower("slug"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));