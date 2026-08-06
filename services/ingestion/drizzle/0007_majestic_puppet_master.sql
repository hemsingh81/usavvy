ALTER TABLE "chunk_embeddings" ALTER COLUMN "custom_course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ALTER COLUMN "custom_course_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chunk_embeddings" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "course_id" uuid;