ALTER TABLE "courses" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "estimated_duration_hours" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;