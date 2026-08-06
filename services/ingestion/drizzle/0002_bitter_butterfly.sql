ALTER TABLE "content_chunks" ADD COLUMN "safety_status" text DEFAULT 'clear' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_chunks" ADD COLUMN "safety_category" text;