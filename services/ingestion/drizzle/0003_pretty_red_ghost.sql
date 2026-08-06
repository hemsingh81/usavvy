ALTER TABLE "content_chunks" DROP CONSTRAINT "content_chunks_document_id_uploaded_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_document_id_uploaded_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."uploaded_documents"("id") ON DELETE cascade ON UPDATE no action;