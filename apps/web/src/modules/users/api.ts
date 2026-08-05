import {
  ageDeclarationResponseSchema,
  learnerPreferencesSchema,
  learnerPrivacySettingsSchema,
  learnerProfileResponseSchema,
  meResponseSchema,
  parentalConsentResponseSchema,
  type AgeDeclarationResponse,
  type LearnerPreferences,
  type LearnerPrivacySettings,
  type LearnerProfileResponse,
  type MeResponse,
  type OnboardingStepInput,
  type ParentalConsentResponse,
  type PreferencesUpdateInput,
  type PrivacySettingsUpdateInput,
  type UpdateDisplayNameInput,
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
    getPreferences: (accessToken: string): Promise<LearnerPreferences> =>
      apiRequest(apiUrl, "/users/preferences", learnerPreferencesSchema, { method: "GET", accessToken }),
    savePreferences: (accessToken: string, input: PreferencesUpdateInput): Promise<LearnerPreferences> =>
      apiRequest(apiUrl, "/users/preferences", learnerPreferencesSchema, { method: "PUT", body: input, accessToken }),
    updateDisplayName: (accessToken: string, input: UpdateDisplayNameInput): Promise<MeResponse> =>
      apiRequest(apiUrl, "/users/display-name", meResponseSchema, { method: "PUT", body: input, accessToken }),
    getPrivacySettings: (accessToken: string): Promise<LearnerPrivacySettings> =>
      apiRequest(apiUrl, "/users/privacy-settings", learnerPrivacySettingsSchema, { method: "GET", accessToken }),
    savePrivacySettings: (accessToken: string, input: PrivacySettingsUpdateInput): Promise<LearnerPrivacySettings> =>
      apiRequest(apiUrl, "/users/privacy-settings", learnerPrivacySettingsSchema, { method: "PUT", body: input, accessToken }),
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
