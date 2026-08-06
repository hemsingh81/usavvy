/**
 * AD-6: any code that reads/writes a durable file artifact depends on this interface,
 * never on a concrete adapter. The SeaweedFS binding is the dev default until a hosted
 * S3/GCS adapter is configured (AD-12) — swapping it in is a config change, not a
 * call-site change.
 */
export interface StoragePort {
  putObject(key: string, data: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
}
