import { listUploadsQuerySchema, uploadedDocumentResponseSchema, type UploadedDocumentResponse } from "@usavvy/shared-types";
import { apiRequest, ApiError, throwForErrorResponse } from "../../shared/apiClient.js";

const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Story 2.7. Not built on top of the shared `apiRequest` helper — `FormData` must not
 * be JSON-stringified, and its multipart `content-type` (with the boundary) must be set
 * by the browser itself, never manually — a different enough shape to keep separate,
 * matching `apiRequestBlob`'s own precedent as a sibling rather than a forced
 * generalization of `apiRequest`.
 */
export async function uploadFile(
  apiUrl: string,
  accessToken: string,
  customCourseId: string | undefined,
  file: File,
  copyrightAttested: boolean,
): Promise<UploadedDocumentResponse> {
  const formData = new FormData();
  if (customCourseId) formData.set("customCourseId", customCourseId);
  formData.set("copyrightAttested", String(copyrightAttested));
  // The file field must come last — ingestion's multipart parsing only guarantees the
  // OTHER fields are available once the file stream is fully drained (see
  // services/ingestion/src/modules/uploads/routes.ts's own comment on this).
  formData.set("file", file);

  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
      body: formData,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }

  if (!response.ok) {
    return throwForErrorResponse(response);
  }
  const json: unknown = await response.json().catch(() => undefined);
  return uploadedDocumentResponseSchema.parse(json);
}

/** Story 2.8, AC #1: unlike uploadFile, a plain JSON body — built on the shared apiRequest helper. */
export function pasteText(
  apiUrl: string,
  accessToken: string,
  customCourseId: string | undefined,
  text: string,
  copyrightAttested: boolean,
): Promise<UploadedDocumentResponse> {
  return apiRequest(apiUrl, "/uploads/paste-text", uploadedDocumentResponseSchema, {
    method: "POST",
    body: { ...(customCourseId ? { customCourseId } : {}), text, copyrightAttested },
    accessToken,
  });
}

/** Story 2.8, AC #2/#3. */
export function importFromUrl(
  apiUrl: string,
  accessToken: string,
  customCourseId: string | undefined,
  url: string,
  copyrightAttested: boolean,
): Promise<UploadedDocumentResponse> {
  return apiRequest(apiUrl, "/uploads/url-import", uploadedDocumentResponseSchema, {
    method: "POST",
    body: { ...(customCourseId ? { customCourseId } : {}), url, copyrightAttested },
    accessToken,
  });
}

export async function listUploads(apiUrl: string, accessToken: string, customCourseId: string): Promise<UploadedDocumentResponse[]> {
  const query = new URLSearchParams(listUploadsQuerySchema.parse({ customCourseId }));
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads?${query.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }

  if (!response.ok) {
    return throwForErrorResponse(response);
  }
  const json: unknown = await response.json().catch(() => undefined);
  return uploadedDocumentResponseSchema.array().parse(json);
}
