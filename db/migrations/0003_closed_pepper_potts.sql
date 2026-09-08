ALTER TABLE "attendance_records" ADD COLUMN "lesson_statuses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "timetable_lessons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD COLUMN "lesson_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_lesson_count_check" CHECK ("attendance_sessions"."lesson_count" between 1 and 12);