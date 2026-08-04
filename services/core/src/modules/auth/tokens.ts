import { createHash, randomBytes } from "node:crypto";

/**
 * 32 random bytes, base64url-encoded — used for email verification links. Only the
 * hash of this value is ever persisted (see `hashToken`); the raw value is emailed
 * once and never stored.
 */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 is sufficient here (not argon2/bcrypt): a verification/refresh token is a
 * high-entropy random value, not a low-entropy human-chosen secret being brute-forced
 * the way a password is — a slow KDF would add cost with no real security benefit.
 */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
