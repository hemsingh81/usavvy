import { z } from "zod";

export const parentalConsentStatusSchema = z.enum(["not_required", "pending", "granted"]);

export type ParentalConsentStatus = z.infer<typeof parentalConsentStatusSchema>;

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.string(),
  // Story 1.2 (FR-A-2/NFR-16) — all three null until the learner declares their age.
  birthdate: z.string().nullable(),
  isMinor: z.boolean().nullable(),
  parentalConsentStatus: parentalConsentStatusSchema.nullable(),
  // Story 1.3 (FR-A-3) — false (never null) even before any learnerProfiles row
  // exists: every learner must onboard, unlike age-declaration's three-state fields.
  onboardingComplete: z.boolean(),
});

export type MeResponse = z.infer<typeof meResponseSchema>;

const userSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
});

export const authSessionResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: userSummarySchema,
});

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const signupResponseSchema = z.object({ userId: z.string() });

export type SignupResponse = z.infer<typeof signupResponseSchema>;

export const ageDeclarationResponseSchema = z.object({
  isMinor: z.boolean(),
  parentalConsentStatus: parentalConsentStatusSchema,
});

export type AgeDeclarationResponse = z.infer<typeof ageDeclarationResponseSchema>;

export const parentalConsentResponseSchema = z.object({ success: z.literal(true) });

export type ParentalConsentResponse = z.infer<typeof parentalConsentResponseSchema>;
