CREATE TABLE "content_chunks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"heading" text,
	"page_range_start" integer,
	"page_range_end" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uploaded_documents" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_document_id_uploaded_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."uploaded_documents"("id") ON DELETE no action ON UPDATE no action;