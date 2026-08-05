import { catalogListResponseSchema, courseResponseSchema, type CatalogSearchParams, type CourseResponse, type CourseSummary } from "@usavvy/shared-types";
import { apiRequest } from "../../shared/apiClient.js";

function buildQueryString(params: CatalogSearchParams): string {
  const search = new URLSearchParams();
  if (params.subject) search.set("subject", params.subject);
  if (params.level) search.set("level", params.level);
  if (params.durationBucket) search.set("durationBucket", params.durationBucket);
  if (params.q) search.set("q", params.q);
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Thin typed fetch wrapper for gateway's /courses catalog routes. */
export function createCoursesApi(apiUrl: string) {
  return {
    searchCatalog: (accessToken: string, params: CatalogSearchParams): Promise<CourseSummary[]> =>
      apiRequest(apiUrl, `/courses${buildQueryString(params)}`, catalogListResponseSchema, { method: "GET", accessToken }),
    // Story 2.3: GET /courses/:id already exists (Story 2.1) — this is just its first
    // apps/web consumer.
    getCourse: (accessToken: string, id: string): Promise<CourseResponse> =>
      apiRequest(apiUrl, `/courses/${id}`, courseResponseSchema, { method: "GET", accessToken }),
  };
}

export type CoursesApi = ReturnType<typeof createCoursesApi>;
