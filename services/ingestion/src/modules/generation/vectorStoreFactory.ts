import type { Db } from "../../db/client.js";
import type { VectorStorePort } from "./vectorStorePort.js";
import { createMockVectorStoreAdapter } from "./vectorStoreMock.js";
import { createPgvectorAdapter } from "./vectorStorePgvector.js";

export type VectorStoreAdapterName = "mock" | "pgvector";

export function createVectorStoreAdapter(adapter: VectorStoreAdapterName, db: Db): VectorStorePort {
  switch (adapter) {
    case "mock":
      return createMockVectorStoreAdapter();
    case "pgvector":
      return createPgvectorAdapter(db);
  }
}
