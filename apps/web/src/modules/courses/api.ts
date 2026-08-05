import { catalogListResponseSchema, type CatalogSearchParams, type CourseSummary } from "@usavvy/shared-types";
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
  };
}

export type CoursesApi = ReturnType<typeof createCoursesApi>;
