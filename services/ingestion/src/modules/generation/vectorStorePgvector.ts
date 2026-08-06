import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { chunkEmbeddings } from "../../db/schema.js";
import type { VectorStoreEntry, VectorStorePort } from "./vectorStorePort.js";

/** Real VectorStorePort adapter — persists to the pgvector-backed `chunk_embeddings` table. */
export function createPgvectorAdapter(db: Db): VectorStorePort {
  return {
    async upsert(entries: VectorStoreEntry[]) {
      if (entries.length === 0) return;
      await db
        .insert(chunkEmbeddings)
        .values(
          entries.map((entry) => ({
            chunkId: entry.chunkId,
            documentId: entry.documentId,
            customCourseId: entry.customCourseId,
            conceptId: entry.conceptId,
            embedding: entry.embedding,
          })),
        )
        .onConflictDoUpdate({
          target: chunkEmbeddings.chunkId,
          set: {
            documentId: sql`excluded.document_id`,
            customCourseId: sql`excluded.custom_course_id`,
            conceptId: sql`excluded.concept_id`,
            embedding: sql`excluded.embedding`,
          },
        });
    },
  };
}
