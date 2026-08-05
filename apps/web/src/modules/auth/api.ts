import {
  authSessionResponseSchema,
  meResponseSchema,
  signupResponseSchema,
  type AuthSessionResponse,
  type MeResponse,
  type SignupResponse,
} from "@usavvy/shared-types";
import { apiRequest, ApiError } from "../../shared/apiClient.js";

// Alias kept so every existing call site (`instanceof AuthApiError`) is unaffected by
// the extraction of the shared request/error plumbing to shared/apiClient.ts.
export { ApiError as AuthApiError };

/** Thin typed fetch wrapper for gateway's /auth/* and /me routes. */
export function createAuthApi(apiUrl: string) {
  return {
    signup: (input: { email: string; password: string }): Promise<SignupResponse> =>
      apiRequest(apiUrl, "/auth/signup", signupResponseSchema, { method: "POST", body: input }),
    login: (input: { email: string; password: string }): Promise<AuthSessionResponse> =>
      apiRequest(apiUrl, "/auth/login", authSessionResponseSchema, { method: "POST", body: input }),
    verifyEmail: (input: { token: string }): Promise<AuthSessionResponse> =>
      apiRequest(apiUrl, "/auth/verify-email", authSessionResponseSchema, { method: "POST", body: input }),
    refresh: (input: { refreshToken: string }): Promise<{ accessToken: string; refreshToken: string }> =>
      apiRequest(apiUrl, "/auth/refresh", authSessionResponseSchema.pick({ accessToken: true, refreshToken: true }), {
        method: "POST",
        body: input,
      }),
    googleAuth: (input: { idToken: string }): Promise<AuthSessionResponse> =>
      apiRequest(apiUrl, "/auth/google", authSessionResponseSchema, { method: "POST", body: input }),
    me: (accessToken: string): Promise<MeResponse> => apiRequest(apiUrl, "/me", meResponseSchema, { method: "GET", accessToken }),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
