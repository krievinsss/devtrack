CREATE TABLE "journal_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"group_id" text NOT NULL,
	"teacher_membership_id" uuid,
	"subject" varchar(180) NOT NULL,
	"academic_year" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lesson_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"topic" varchar(300) NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"type" varchar(30) DEFAULT 'lesson' NOT NULL,
	"planned_date" varchar(10),
	"timetable_period" integer,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lesson_plan_items_sequence_check" CHECK ("lesson_plan_items"."sequence" > 0),
	CONSTRAINT "lesson_plan_items_type_check" CHECK ("lesson_plan_items"."type" in ('lesson','practical','formative','summative','final')),
	CONSTRAINT "lesson_plan_items_period_check" CHECK ("lesson_plan_items"."timetable_period" is null or "lesson_plan_items"."timetable_period" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "journal_courses" ADD CONSTRAINT "journal_courses_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_courses" ADD CONSTRAINT "journal_courses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_courses" ADD CONSTRAINT "journal_courses_teacher_membership_id_school_memberships_id_fk" FOREIGN KEY ("teacher_membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lesson_plan_items" ADD CONSTRAINT "lesson_plan_items_course_id_journal_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."journal_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_courses_group_subject_unique" ON "journal_courses" USING btree ("group_id",lower("subject"));--> statement-breakpoint
CREATE INDEX "journal_courses_school_idx" ON "journal_courses" USING btree ("school_id","active");--> statement-breakpoint
CREATE INDEX "journal_courses_teacher_idx" ON "journal_courses" USING btree ("teacher_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lesson_plan_items_course_sequence_unique" ON "lesson_plan_items" USING btree ("course_id","sequence");--> statement-breakpoint
CREATE INDEX "lesson_plan_items_course_date_idx" ON "lesson_plan_items" USING btree ("course_id","planned_date");
--> statement-breakpoint
INSERT INTO "journal_courses" ("school_id", "group_id", "teacher_membership_id", "subject", "active")
SELECT DISTINCT ON ("group_id", lower("title"))
	"school_id", "group_id", "teacher_membership_id", "title", true
FROM "attendance_sessions"
WHERE "status" <> 'cancelled'
ORDER BY "group_id", lower("title"), "starts_at" DESC
ON CONFLICT DO NOTHING;
