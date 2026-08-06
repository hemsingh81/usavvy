CREATE TABLE "custom_course_confirmations" (
	"custom_course_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "proposed_concepts" ADD COLUMN "priority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proposed_topics" ADD COLUMN "priority" boolean DEFAULT false NOT NULL;