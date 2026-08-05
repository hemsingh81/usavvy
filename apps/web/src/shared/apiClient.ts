import { errorEnvelopeSchema } from "@usavvy/shared-types";

const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Schema<T> {
  parse: (value: unknown) => T;
}

/**
 * Thin typed fetch wrapper for gateway routes — shared by every feature module
 * (auth, users, ...) rather than each redefining it. Mirrors the same pattern
 * coreClient.ts uses for gateway->core calls.
 */
export async function apiRequest<T>(
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
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }

  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(json);
    if (parsedError.success) {
      throw new ApiError(parsedError.data.error.code, parsedError.data.error.message);
    }
    throw new ApiError("UNKNOWN_ERROR", "an unexpected error occurred");
  }
  return schema.parse(json);
}
