import { z } from "zod";

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  role: z.string(),
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
