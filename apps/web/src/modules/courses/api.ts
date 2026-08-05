import {
  catalogListResponseSchema,
  courseCustomizationResponseSchema,
  courseResponseSchema,
  placementCheckProposalSchema,
  placementCheckQuestionsResponseSchema,
  startCourseResponseSchema,
  updateToLatestVersionResponseSchema,
  type CatalogSearchParams,
  type CourseCustomizationResponse,
  type CourseResponse,
  type CourseSummary,
  type PlacementCheckAnswerInput,
  type PlacementCheckProposal,
  type PlacementCheckQuestion,
  type SaveCourseCustomizationInput,
  type StartCourseResponse,
  type UpdateToLatestVersionResponse,
} from "@usavvy/shared-types";
import { apiRequest, ApiError } from "../../shared/apiClient.js";

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
    // Story 2.4: a 404 means "no customization saved yet" (AC #4's first-time case), not an
    // error state — caught here and turned into null rather than propagated.
    getCustomization: async (accessToken: string, courseId: string): Promise<CourseCustomizationResponse | null> => {
      try {
        return await apiRequest(apiUrl, `/courses/${courseId}/customization`, courseCustomizationResponseSchema, { method: "GET", accessToken });
      } catch (error) {
        if (error instanceof ApiError && error.code === "NOT_FOUND") {
          return null;
        }
        throw error;
      }
    },
    // A DEPENDENCY_CONFLICT error (AC #3) is left to propagate — the caller needs its
    // `details` (the conflict list), not a swallowed generic message.
    saveCustomization: (accessToken: string, courseId: string, input: SaveCourseCustomizationInput): Promise<CourseCustomizationResponse> =>
      apiRequest(apiUrl, `/courses/${courseId}/customization`, courseCustomizationResponseSchema, { method: "PUT", body: input, accessToken }),
    // Story 2.5: the question pool, and the (stateless — not yet saved) scored proposal.
    getPlacementCheckQuestions: (accessToken: string, courseId: string): Promise<PlacementCheckQuestion[]> =>
      apiRequest(apiUrl, `/courses/${courseId}/placement-check`, placementCheckQuestionsResponseSchema, { method: "GET", accessToken }),
    scorePlacementCheck: (accessToken: string, courseId: string, answers: PlacementCheckAnswerInput[]): Promise<PlacementCheckProposal> =>
      apiRequest(apiUrl, `/courses/${courseId}/placement-check/score`, placementCheckProposalSchema, {
        method: "POST",
        body: { answers },
        accessToken,
      }),
    // Story 2.6: AC #1's minimal "access recorded" call — not a real learning session.
    startCourse: (accessToken: string, courseId: string): Promise<StartCourseResponse> =>
      apiRequest(apiUrl, `/courses/${courseId}/start`, startCourseResponseSchema, { method: "POST", accessToken }),
    updateToLatestVersion: (accessToken: string, courseId: string): Promise<UpdateToLatestVersionResponse> =>
      apiRequest(apiUrl, `/courses/${courseId}/update-to-latest`, updateToLatestVersionResponseSchema, { method: "POST", accessToken }),
  };
}

export type CoursesApi = ReturnType<typeof createCoursesApi>;
