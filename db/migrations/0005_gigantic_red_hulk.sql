CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"source" varchar(30) DEFAULT 'manual' NOT NULL,
	"source_key" varchar(240) NOT NULL,
	"type" varchar(30) DEFAULT 'lesson' NOT NULL,
	"date" varchar(10) NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"timetable_lesson_id" varchar(180),
	"timetable_period" integer,
	"attendance_session_id" uuid,
	"topic" varchar(300) DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"attendance_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_source_check" CHECK ("journal_entries"."source" in ('timetable','manual','assessment')),
	CONSTRAINT "journal_entries_type_check" CHECK ("journal_entries"."type" in ('lesson','assessment','consultation','other'))
);
--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_course_id_journal_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."journal_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_attendance_session_id_attendance_sessions_id_fk" FOREIGN KEY ("attendance_session_id") REFERENCES "public"."attendance_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_course_source_unique" ON "journal_entries" USING btree ("course_id","source_key");--> statement-breakpoint
CREATE INDEX "journal_entries_course_date_idx" ON "journal_entries" USING btree ("course_id","date");--> statement-breakpoint
CREATE INDEX "journal_entries_attendance_idx" ON "journal_entries" USING btree ("attendance_session_id");
--> statement-breakpoint
INSERT INTO "journal_entries" ("course_id", "source", "source_key", "type", "date", "starts_at", "ends_at", "timetable_lesson_id", "timetable_period", "attendance_session_id")
SELECT jc."id", 'timetable', 'attendance:' || s."id" || ':' || coalesce(nullif(lesson.item->>'id',''), lesson.item->>'period', '0'), 'lesson',
	to_char(coalesce(nullif(lesson.item->>'startsAt','')::timestamptz, s."starts_at") AT TIME ZONE 'Europe/Riga', 'YYYY-MM-DD'),
	coalesce(nullif(lesson.item->>'startsAt','')::timestamptz, s."starts_at"),
	coalesce(nullif(lesson.item->>'endsAt','')::timestamptz, s."ends_at"),
	nullif(lesson.item->>'id',''), nullif(lesson.item->>'period','')::integer, s."id"
FROM "attendance_sessions" s
JOIN "journal_courses" jc ON jc."group_id" = s."group_id" AND lower(jc."subject") = lower(s."title")
CROSS JOIN LATERAL jsonb_array_elements(s."timetable_lessons") lesson(item)
WHERE s."status" <> 'cancelled'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "journal_entries" ("course_id", "source", "source_key", "type", "date", "starts_at", "ends_at", "attendance_session_id")
SELECT jc."id", 'timetable', 'attendance:' || s."id" || ':0', 'lesson',
	to_char(s."starts_at" AT TIME ZONE 'Europe/Riga', 'YYYY-MM-DD'), s."starts_at", s."ends_at", s."id"
FROM "attendance_sessions" s
JOIN "journal_courses" jc ON jc."group_id" = s."group_id" AND lower(jc."subject") = lower(s."title")
WHERE s."status" <> 'cancelled' AND jsonb_array_length(s."timetable_lessons") = 0
ON CONFLICT DO NOTHING;
