import { eq } from "drizzle-orm";
import { AppError } from "@usavvy/service-kernel";
import { can, type Role } from "@usavvy/config";
import type { MeResponse } from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { users } from "../../db/schema.js";

export async function getMe(db: Db, userId: string, role: Role): Promise<MeResponse> {
  if (!can(role, "read", "self")) {
    throw new AppError("FORBIDDEN", "not permitted", 403);
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AppError("NOT_FOUND", "user not found", 404);
  }
  return { id: user.id, email: user.email, emailVerified: user.emailVerifiedAt !== null, role: user.role };
}
