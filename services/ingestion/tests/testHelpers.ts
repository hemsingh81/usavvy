import { vi } from "vitest";
import { createLogger, createMockJobQueueAdapter, createMockStorageAdapter } from "@usavvy/service-kernel";
import type { BuildAppDeps } from "../src/app.js";
import type { Db } from "../src/db/client.js";

export const TEST_INTERNAL_SECRET = "test-internal-secret";

export function createTestAppDeps(overrides: Partial<BuildAppDeps> = {}): BuildAppDeps {
  return {
    checkDb: vi.fn().mockResolvedValue(true),
    db: undefined as unknown as Db,
    storagePort: createMockStorageAdapter(),
    jobQueuePort: createMockJobQueueAdapter(),
    internalServiceSecret: TEST_INTERNAL_SECRET,
    logger: createLogger("test"),
    ...overrides,
  };
}

interface MultipartField {
  name: string;
  value: string;
}

interface MultipartFilePart {
  fieldName: string;
  filename: string;
  contentType: string;
  content: Buffer;
}

/** Hand-builds a real multipart/form-data body — fields BEFORE the file, matching the frontend's own field order. */
export function buildMultipartBody(fields: MultipartField[], file: MultipartFilePart): { body: Buffer; contentType: string } {
  const boundary = "----usavvyTestBoundary";
  const parts: Buffer[] = [];

  for (const field of fields) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field.name}"\r\n\r\n${field.value}\r\n`));
  }

  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    ),
    file.content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );

  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}
