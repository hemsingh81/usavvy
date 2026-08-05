CREATE TABLE "learner_course_pins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"version_group_id" uuid NOT NULL,
	"pinned_course_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "version_group_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "version_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_course_pins" ADD CONSTRAINT "learner_course_pins_version_group_id_courses_id_fk" FOREIGN KEY ("version_group_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_course_pins" ADD CONSTRAINT "learner_course_pins_pinned_course_id_courses_id_fk" FOREIGN KEY ("pinned_course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learner_course_pins_user_group_idx" ON "learner_course_pins" USING btree ("user_id","version_group_id");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_version_group_id_courses_id_fk" FOREIGN KEY ("version_group_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;