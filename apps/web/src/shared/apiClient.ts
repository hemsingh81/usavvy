import { errorEnvelopeSchema } from "@usavvy/shared-types";

const REQUEST_TIMEOUT_MS = 10_000;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    // Story 2.4: DEPENDENCY_CONFLICT's structured conflict list needs to reach the caller,
    // not just a flattened message string.
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Schema<T> {
  parse: (value: unknown) => T;
}

// Review finding: apiRequest and apiRequestBlob previously duplicated this exact
// try/catch → parse-error-envelope → throw block verbatim. Shared here since both now
// need it identically.
async function throwForErrorResponse(response: Response): Promise<never> {
  const json: unknown = await response.json().catch(() => undefined);
  const parsedError = errorEnvelopeSchema.safeParse(json);
  if (parsedError.success) {
    throw new ApiError(parsedError.data.error.code, parsedError.data.error.message, parsedError.data.error.details);
  }
  throw new ApiError("UNKNOWN_ERROR", "an unexpected error occurred");
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

  if (!response.ok) {
    return throwForErrorResponse(response);
  }
  const json: unknown = await response.json().catch(() => undefined);
  return schema.parse(json);
}

/**
 * Story 1.8: the first binary download the frontend needs (a PDF export) — apiRequest
 * assumes a JSON response, so this is a sibling, not a generalization of it (a
 * GET-only, no-body binary fetch is a different enough shape to keep separate).
 */
export async function apiRequestBlob(apiUrl: string, path: string, accessToken: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }

  if (!response.ok) {
    return throwForErrorResponse(response);
  }
  return response.blob();
}
