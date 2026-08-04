import type { FastifyInstance } from "fastify";
import { AppError } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import type { Db } from "../../db/client.js";
import { getMe } from "./service.js";

export interface UsersRouteDeps {
  db: Db;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function registerUsersRoutes(app: FastifyInstance, deps: UsersRouteDeps): void {
  app.get("/me", async (request, reply) => {
    // Trusted headers set only by gateway's JWT-verify preHandler (AD-7) — core never
    // re-verifies the JWT itself. A request missing them didn't come through gateway
    // (shouldn't happen given core isn't publicly bound, but AD-17 forbids assuming a
    // guarantee the interface doesn't state).
    const userId = request.headers["x-user-id"];
    const role = request.headers["x-user-role"];
    if (typeof userId !== "string" || typeof role !== "string" || !isRole(role)) {
      throw new AppError("UNAUTHENTICATED", "authentication required", 401);
    }
    reply.send(await getMe(deps.db, userId, role));
  });
}
