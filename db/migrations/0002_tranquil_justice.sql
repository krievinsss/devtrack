CREATE TYPE "public"."attendance_record_status" AS ENUM('present', 'late', 'absent', 'excused');--> statement-breakpoint
CREATE TYPE "public"."attendance_session_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_membership_id" uuid NOT NULL,
	"desk_id" uuid,
	"status" "attendance_record_status" NOT NULL,
	"checked_in_at" timestamp with time zone,
	"marked_by_user_id" text,
	"note" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"classroom_id" uuid NOT NULL,
	"group_id" text NOT NULL,
	"teacher_membership_id" uuid,
	"title" varchar(160) DEFAULT 'Lesson' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"late_after_minutes" integer DEFAULT 10 NOT NULL,
	"status" "attendance_session_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_sessions_time_check" CHECK ("attendance_sessions"."ends_at" > "attendance_sessions"."starts_at"),
	CONSTRAINT "attendance_sessions_late_check" CHECK ("attendance_sessions"."late_after_minutes" between 0 and 120)
);
--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_attendance_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_membership_id_school_memberships_id_fk" FOREIGN KEY ("student_membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_desk_id_desks_id_fk" FOREIGN KEY ("desk_id") REFERENCES "public"."desks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_user_id_users_id_fk" FOREIGN KEY ("marked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_teacher_membership_id_school_memberships_id_fk" FOREIGN KEY ("teacher_membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_student_unique" ON "attendance_records" USING btree ("session_id","student_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_session_desk_unique" ON "attendance_records" USING btree ("session_id","desk_id") WHERE "attendance_records"."desk_id" is not null;--> statement-breakpoint
CREATE INDEX "attendance_records_student_idx" ON "attendance_records" USING btree ("student_membership_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_records_session_status_idx" ON "attendance_records" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "attendance_sessions_school_start_idx" ON "attendance_sessions" USING btree ("school_id","starts_at");--> statement-breakpoint
CREATE INDEX "attendance_sessions_group_start_idx" ON "attendance_sessions" USING btree ("group_id","starts_at");--> statement-breakpoint
CREATE INDEX "attendance_sessions_classroom_status_idx" ON "attendance_sessions" USING btree ("classroom_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_sessions_one_open_room_unique" ON "attendance_sessions" USING btree ("classroom_id") WHERE "attendance_sessions"."status" = 'open';