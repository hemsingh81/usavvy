import {
  createCustomCourseResponseSchema,
  listUploadsQuerySchema,
  proposedTopicResponseSchema,
  uploadedDocumentResponseSchema,
  type CreateCustomCourseResponse,
  type ProposedTopicResponse,
  type UploadedDocumentResponse,
} from "@usavvy/shared-types";
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
  courseId: string | undefined,
  file: File,
  copyrightAttested: boolean,
): Promise<UploadedDocumentResponse> {
  const formData = new FormData();
  if (customCourseId) formData.set("customCourseId", customCourseId);
  // Story 2.14 (FR-C-14): attaching a personal note to an EXISTING catalog course —
  // mutually exclusive with customCourseId, mirroring services/ingestion's own
  // exactly-one-of invariant (resolveUploadGroupKey).
  if (courseId) formData.set("courseId", courseId);
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
  courseId: string | undefined,
  text: string,
  copyrightAttested: boolean,
): Promise<UploadedDocumentResponse> {
  return apiRequest(apiUrl, "/uploads/paste-text", uploadedDocumentResponseSchema, {
    method: "POST",
    body: { ...(customCourseId ? { customCourseId } : {}), ...(courseId ? { courseId } : {}), text, copyrightAttested },
    accessToken,
  });
}

/** Story 2.8, AC #2/#3. */
export function importFromUrl(
  apiUrl: string,
  accessToken: string,
  customCourseId: string | undefined,
  courseId: string | undefined,
  url: string,
  copyrightAttested: boolean,
): Promise<UploadedDocumentResponse> {
  return apiRequest(apiUrl, "/uploads/url-import", uploadedDocumentResponseSchema, {
    method: "POST",
    body: { ...(customCourseId ? { customCourseId } : {}), ...(courseId ? { courseId } : {}), url, copyrightAttested },
    accessToken,
  });
}

/** Story 2.14 (FR-C-14): exactly one of the two, mirroring services/ingestion's own UploadGroupKey. */
export type UploadGroupKey = { customCourseId: string } | { courseId: string };

export async function listUploads(apiUrl: string, accessToken: string, groupKey: UploadGroupKey): Promise<UploadedDocumentResponse[]> {
  // Exactly one key is ever present on groupKey (the discriminated union guarantees
  // it), so the parsed result is always a single-entry record — safe to narrow for
  // URLSearchParams, whose type doesn't know that.
  const query = new URLSearchParams(listUploadsQuerySchema.parse(groupKey) as Record<string, string>);
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

/** Story 2.11 (FR-C-11), AC #3. A 204 response has no body to parse — a plain fetch, matching uploadFile/listUploads's own precedent for non-`apiRequest`-shaped calls. */
export async function deleteUpload(apiUrl: string, accessToken: string, id: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }

  if (!response.ok) {
    await throwForErrorResponse(response);
  }
}

/** Story 2.13 (FR-C-10), AC #1. */
export async function listOutline(apiUrl: string, accessToken: string, customCourseId: string): Promise<ProposedTopicResponse[]> {
  const query = new URLSearchParams({ customCourseId });
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads/outline?${query.toString()}`, {
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
  return proposedTopicResponseSchema.array().parse(json);
}

async function patchOutlineItem(apiUrl: string, accessToken: string, kind: "topics" | "concepts", id: string, body: { title?: string; priority?: boolean }): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads/outline/${kind}/${id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }
  if (!response.ok) {
    await throwForErrorResponse(response);
  }
}

export const renameProposedTopic = (apiUrl: string, accessToken: string, id: string, title: string): Promise<void> =>
  patchOutlineItem(apiUrl, accessToken, "topics", id, { title });

export const renameProposedConcept = (apiUrl: string, accessToken: string, id: string, title: string): Promise<void> =>
  patchOutlineItem(apiUrl, accessToken, "concepts", id, { title });

export const setProposedTopicPriority = (apiUrl: string, accessToken: string, id: string, priority: boolean): Promise<void> =>
  patchOutlineItem(apiUrl, accessToken, "topics", id, { priority });

export const setProposedConceptPriority = (apiUrl: string, accessToken: string, id: string, priority: boolean): Promise<void> =>
  patchOutlineItem(apiUrl, accessToken, "concepts", id, { priority });

async function deleteOutlineItem(apiUrl: string, accessToken: string, kind: "topics" | "concepts", id: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads/outline/${kind}/${id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }
  if (!response.ok) {
    await throwForErrorResponse(response);
  }
}

export const deleteProposedTopic = (apiUrl: string, accessToken: string, id: string): Promise<void> => deleteOutlineItem(apiUrl, accessToken, "topics", id);

export const deleteProposedConcept = (apiUrl: string, accessToken: string, id: string): Promise<void> => deleteOutlineItem(apiUrl, accessToken, "concepts", id);

/** Story 2.13 (FR-C-10), AC #1: a bulk "here's the new order" call, not per-item drag-and-drop. */
export async function reorderProposedTopics(apiUrl: string, accessToken: string, customCourseId: string, orderedTopicIds: string[]): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads/outline/topics/reorder`, {
      method: "PUT",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ customCourseId, orderedTopicIds }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }
  if (!response.ok) {
    await throwForErrorResponse(response);
  }
}

/** Story 2.13 (FR-C-10), AC #4. */
export async function mergeProposedConcepts(apiUrl: string, accessToken: string, keepConceptId: string, mergeConceptId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}/uploads/outline/concepts/merge`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ keepConceptId, mergeConceptId }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "unable to reach the server");
  }
  if (!response.ok) {
    await throwForErrorResponse(response);
  }
}

/** Story 2.13 (FR-C-10), AC #2/#3. Calls gateway's outline-confirmation orchestration route. */
export function confirmOutline(apiUrl: string, accessToken: string, customCourseId: string): Promise<CreateCustomCourseResponse> {
  return apiRequest(apiUrl, `/uploads/outline/${customCourseId}/confirm`, createCustomCourseResponseSchema, { method: "POST", accessToken });
}
