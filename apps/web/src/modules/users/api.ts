import {
  ageDeclarationResponseSchema,
  learnerProfileResponseSchema,
  parentalConsentResponseSchema,
  type AgeDeclarationResponse,
  type LearnerProfileResponse,
  type OnboardingStepInput,
  type ParentalConsentResponse,
} from "@usavvy/shared-types";
import { apiRequest } from "../../shared/apiClient.js";

/** Thin typed fetch wrapper for gateway's /users/* routes. */
export function createUsersApi(apiUrl: string) {
  return {
    declareAge: (accessToken: string, input: { birthdate: string; parentEmail?: string }): Promise<AgeDeclarationResponse> =>
      apiRequest(apiUrl, "/users/age-declaration", ageDeclarationResponseSchema, { method: "POST", body: input, accessToken }),
    parentalConsent: (input: { token: string }): Promise<ParentalConsentResponse> =>
      apiRequest(apiUrl, "/users/parental-consent", parentalConsentResponseSchema, { method: "POST", body: input }),
    getOnboarding: (accessToken: string): Promise<LearnerProfileResponse> =>
      apiRequest(apiUrl, "/users/onboarding", learnerProfileResponseSchema, { method: "GET", accessToken }),
    saveOnboardingStep: (accessToken: string, input: OnboardingStepInput): Promise<LearnerProfileResponse> =>
      apiRequest(apiUrl, "/users/onboarding/step", learnerProfileResponseSchema, { method: "PUT", body: input, accessToken }),
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
