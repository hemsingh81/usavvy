import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, type Logger } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import {
  onboardingStepInputSchema,
  preferencesUpdateInputSchema,
  privacySettingsUpdateInputSchema,
  updateDisplayNameInputSchema,
} from "@usavvy/shared-types";
import { emailField } from "../auth/index.js";
import { parseOrThrow } from "../auth/validation.js";
import type { Db } from "../../db/client.js";
import type { NotificationPort } from "../notification/index.js";
import type { PubSubPort } from "../pubsub/index.js";
import { calculateAge } from "./age.js";
import { generateDataExportPdf } from "./dataExportPdf.js";
import {
  clearNotification,
  declareAge,
  generateDataExport,
  getActivityHistory,
  getMe,
  getOnboarding,
  getPreferences,
  getPrivacySettings,
  listNotifications,
  markNotificationRead,
  recordParentalConsent,
  requestAccountDeletion,
  saveOnboardingStep,
  savePreferences,
  savePrivacySettings,
  updateDisplayName,
} from "./service.js";

export interface UsersRouteDeps {
  db: Db;
  notificationPort: NotificationPort;
  pubSubPort: PubSubPort;
  logger: Logger;
}

const MAX_AGE_YEARS = 120;

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// z.iso.date() validates the "YYYY-MM-DD" wire format (verified live) — a plain
// z.string() plus manual Date parsing would accept ambiguous/datetime strings.
const birthdateField = z.iso
  .date()
  .refine((value) => value <= todayIso(), { message: "birthdate cannot be in the future" })
  .refine((value) => calculateAge(value, todayIso()) <= MAX_AGE_YEARS, { message: `birthdate cannot be more than ${MAX_AGE_YEARS} years ago` });

const ageDeclarationSchema = z.object({ birthdate: birthdateField, parentEmail: emailField.optional() });
const parentalConsentSchema = z.object({ token: z.string().min(1) });
// Review finding: a non-UUID id (e.g. a client typo, or an id that arrived after the
// gateway's own path-traversal attempt) previously passed a bare z.string().min(1) check
// and then hit Postgres's uuid-typed column, surfacing as an unhandled 500 rather than a
// clean 400 — and, at the gateway layer, a validation this loose does nothing to stop a
// slash/dot-segment id from being spliced into a forwarded path in the first place.
const notificationIdParamsSchema = z.object({ id: z.uuid() });

// Trusted headers set only by gateway's JWT-verify preHandler (AD-7) — core never
// re-verifies the JWT itself. A request missing them didn't come through gateway
// (shouldn't happen given core isn't publicly bound, but AD-17 forbids assuming a
// guarantee the interface doesn't state). Factored out once this story added a third
// and fourth authenticated route needing the identical check (Story 1.2's own review
// flagged the prior two-copy duplication as a "soon more" — this is that "more").
function requireTrustedUser(request: FastifyRequest): { userId: string; role: Role } {
  const userId = request.headers["x-user-id"];
  const role = request.headers["x-user-role"];
  if (typeof userId !== "string" || typeof role !== "string" || !isRole(role)) {
    throw new AppError("UNAUTHENTICATED", "authentication required", 401);
  }
  return { userId, role };
}

export function registerUsersRoutes(app: FastifyInstance, deps: UsersRouteDeps): void {
  app.get("/me", async (request, reply) => {
    const { userId, role } = requireTrustedUser(request);
    reply.send(await getMe(deps.db, userId, role));
  });

  app.post("/users/age-declaration", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(ageDeclarationSchema, request.body);
    reply.send(await declareAge(deps.db, deps.notificationPort, userId, body));
  });

  // Unauthenticated by design — the parent has no account/session (see service.ts).
  app.post("/users/parental-consent", async (request, reply) => {
    const body = parseOrThrow(parentalConsentSchema, request.body);
    reply.send(await recordParentalConsent(deps.db, body));
  });

  app.get("/users/onboarding", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    reply.send(await getOnboarding(deps.db, userId));
  });

  app.put("/users/onboarding/step", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(onboardingStepInputSchema, request.body);
    reply.send(await saveOnboardingStep(deps.db, userId, body));
  });

  app.get("/users/preferences", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    reply.send(await getPreferences(deps.db, userId));
  });

  app.put("/users/preferences", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(preferencesUpdateInputSchema, request.body);
    reply.send(await savePreferences(deps.db, userId, body));
  });

  app.put("/users/display-name", async (request, reply) => {
    const { userId, role } = requireTrustedUser(request);
    const body = parseOrThrow(updateDisplayNameInputSchema, request.body);
    reply.send(await updateDisplayName(deps.db, userId, role, body));
  });

  app.get("/users/privacy-settings", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    reply.send(await getPrivacySettings(deps.db, userId));
  });

  app.put("/users/privacy-settings", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(privacySettingsUpdateInputSchema, request.body);
    reply.send(await savePrivacySettings(deps.db, userId, body));
  });

  app.post("/users/account-deletion", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    reply.send(await requestAccountDeletion(deps.db, deps.notificationPort, deps.pubSubPort, deps.logger, userId));
  });

  app.get("/users/data-export/json", async (request, reply) => {
    const { userId, role } = requireTrustedUser(request);
    reply.send(await generateDataExport(deps.db, userId, role));
  });

  // The first non-JSON success response in this codebase — reply.send(buffer) bypasses
  // Fastify's default JSON serialization; the error path (e.g. requireTrustedUser's
  // 401) still goes through the normal JSON error envelope untouched.
  app.get("/users/data-export/pdf", async (request, reply) => {
    const { userId, role } = requireTrustedUser(request);
    const data = await generateDataExport(deps.db, userId, role);
    const buffer = await generateDataExportPdf(data);
    reply.type("application/pdf").header("content-disposition", 'attachment; filename="usavvy-data-export.pdf"').send(buffer);
  });

  app.get("/users/notifications", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    reply.send(await listNotifications(deps.db, userId));
  });

  // Story 1.10: the first routes in this codebase with a path parameter — validated
  // explicitly rather than trusting request.params blindly.
  app.put("/users/notifications/:id/read", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(notificationIdParamsSchema, request.params);
    reply.send(await markNotificationRead(deps.db, userId, id));
  });

  app.delete("/users/notifications/:id", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(notificationIdParamsSchema, request.params);
    await clearNotification(deps.db, userId, id);
    reply.code(204).send();
  });

  // Review finding: unlike every sibling route above, this one doesn't destructure
  // `userId` from requireTrustedUser — deliberately, since getActivityHistory() has no
  // query to scope by it yet and an unused binding would fail this repo's zero-tolerance
  // no-unused-vars lint rule. Whichever future story (3.x/6.x/7.x) adds the first real
  // read MUST destructure { userId } here and thread it through, matching every other
  // route in this file — do not add a real query without also adding that scoping.
  app.get("/users/activity-history", async (request, reply) => {
    requireTrustedUser(request);
    reply.send(await getActivityHistory());
  });
}
