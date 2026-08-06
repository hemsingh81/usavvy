import type { StoragePort } from "./port.js";

/**
 * In-memory StoragePort for tests — mirrors notification/mock.ts's shape (a real
 * dependency, no real I/O), never used outside a test process.
 */
export function createMockStorageAdapter(): StoragePort {
  const objects = new Map<string, Buffer>();

  return {
    async putObject(key, data) {
      objects.set(key, data);
    },

    async getObject(key) {
      const data = objects.get(key);
      if (!data) {
        throw new Error(`mock storage: no object at key ${key}`);
      }
      return data;
    },

    async deleteObject(key) {
      objects.delete(key);
    },
  };
}
