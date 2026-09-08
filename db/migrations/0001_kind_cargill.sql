CREATE TYPE "public"."classroom_access_role" AS ENUM('viewer', 'manager');--> statement-breakpoint
CREATE TABLE "classroom_staff" (
	"classroom_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"role" "classroom_access_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classroom_staff_pk" PRIMARY KEY("classroom_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" text NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(140) NOT NULL,
	"canvas_width" integer DEFAULT 1000 NOT NULL,
	"canvas_height" integer DEFAULT 600 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classrooms_canvas_width_check" CHECK ("classrooms"."canvas_width" between 400 and 3000),
	CONSTRAINT "classrooms_canvas_height_check" CHECK ("classrooms"."canvas_height" between 300 and 2000),
	CONSTRAINT "classrooms_version_check" CHECK ("classrooms"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "desks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"label" varchar(80),
	"x" integer DEFAULT 0 NOT NULL,
	"y" integer DEFAULT 0 NOT NULL,
	"width" integer DEFAULT 120 NOT NULL,
	"height" integer DEFAULT 80 NOT NULL,
	"qr_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "desks_position_check" CHECK ("desks"."x" >= 0 and "desks"."y" >= 0),
	CONSTRAINT "desks_size_check" CHECK ("desks"."width" between 60 and 360 and "desks"."height" between 40 and 260)
);
--> statement-breakpoint
ALTER TABLE "classroom_staff" ADD CONSTRAINT "classroom_staff_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_staff" ADD CONSTRAINT "classroom_staff_membership_id_school_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."school_memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desks" ADD CONSTRAINT "desks_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classroom_staff_membership_idx" ON "classroom_staff" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classrooms_school_slug_lower_unique" ON "classrooms" USING btree ("school_id",lower("slug"));--> statement-breakpoint
CREATE INDEX "classrooms_school_active_idx" ON "classrooms" USING btree ("school_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "desks_classroom_code_lower_unique" ON "desks" USING btree ("classroom_id",lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "desks_qr_token_unique" ON "desks" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "desks_classroom_idx" ON "desks" USING btree ("classroom_id");