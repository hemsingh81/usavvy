CREATE TABLE "course_customizations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"deselected_topic_ids" text[],
	"priority_topic_ids" text[],
	"depth" text DEFAULT 'standard' NOT NULL,
	"explanation_style" text DEFAULT 'concise' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_customizations" ADD CONSTRAINT "course_customizations_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_customizations_user_course_idx" ON "course_customizations" USING btree ("user_id","course_id");