import {
  authSessionResponseSchema,
  errorEnvelopeSchema,
  meResponseSchema,
  signupResponseSchema,
  type AuthSessionResponse,
  type MeResponse,
  type SignupResponse,
} from "@usavvy/shared-types";

const REQUEST_TIMEOUT_MS = 10_000;

export class AuthApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

interface Schema<T> {
  parse: (value: unknown) => T;
}

async function request<T>(
  apiUrl: string,
  path: string,
  schema: Schema<T>,
  init: { method: string; body?: unknown; accessToken?: string },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        ...(init.accessToken ? { authorization: `Bearer ${init.accessToken}` } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new AuthApiError("NETWORK_ERROR", "unable to reach the server");
  }

  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(json);
    if (parsedError.success) {
      throw new AuthApiError(parsedError.data.error.code, parsedError.data.error.message);
    }
    throw new AuthApiError("UNKNOWN_ERROR", "an unexpected error occurred");
  }
  return schema.parse(json);
}

/** Thin typed fetch wrapper for gateway's /auth/* and /me routes — apps/web's version of the same pattern coreClient.ts uses for gateway->core calls. */
export function createAuthApi(apiUrl: string) {
  return {
    signup: (input: { email: string; password: string }): Promise<SignupResponse> =>
      request(apiUrl, "/auth/signup", signupResponseSchema, { method: "POST", body: input }),
    login: (input: { email: string; password: string }): Promise<AuthSessionResponse> =>
      request(apiUrl, "/auth/login", authSessionResponseSchema, { method: "POST", body: input }),
    verifyEmail: (input: { token: string }): Promise<AuthSessionResponse> =>
      request(apiUrl, "/auth/verify-email", authSessionResponseSchema, { method: "POST", body: input }),
    refresh: (input: { refreshToken: string }): Promise<{ accessToken: string; refreshToken: string }> =>
      request(apiUrl, "/auth/refresh", authSessionResponseSchema.pick({ accessToken: true, refreshToken: true }), {
        method: "POST",
        body: input,
      }),
    googleAuth: (input: { idToken: string }): Promise<AuthSessionResponse> =>
      request(apiUrl, "/auth/google", authSessionResponseSchema, { method: "POST", body: input }),
    me: (accessToken: string): Promise<MeResponse> => request(apiUrl, "/me", meResponseSchema, { method: "GET", accessToken }),
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
