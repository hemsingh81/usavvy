import type { Logger } from "../logger.js";
import type { StoragePort } from "./port.js";
import { createSeaweedFsStorageAdapter } from "./seaweedfs.js";
import { createMockStorageAdapter } from "./mock.js";

export type StorageAdapterName = "mock" | "seaweedfs";

/**
 * AD-1/AD-12: the one place the mock/real StoragePort binding is selected, driven by
 * config rather than hardcoded at each call site.
 */
export function createStorageAdapter(adapter: StorageAdapterName, endpoint: string, bucket: string, logger: Logger): StoragePort {
  switch (adapter) {
    case "mock":
      return createMockStorageAdapter();
    case "seaweedfs":
      return createSeaweedFsStorageAdapter(endpoint, bucket, logger);
  }
}
