import {
  accountDeletionResponseSchema,
  ageDeclarationResponseSchema,
  learnerPreferencesSchema,
  learnerPrivacySettingsSchema,
  learnerProfileResponseSchema,
  meResponseSchema,
  notificationListResponseSchema,
  notificationResponseSchema,
  parentalConsentResponseSchema,
  type AccountDeletionResponse,
  type AgeDeclarationResponse,
  type LearnerPreferences,
  type LearnerPrivacySettings,
  type LearnerProfileResponse,
  type MeResponse,
  type NotificationResponse,
  type OnboardingStepInput,
  type ParentalConsentResponse,
  type PreferencesUpdateInput,
  type PrivacySettingsUpdateInput,
  type UpdateDisplayNameInput,
} from "@usavvy/shared-types";
import { apiRequest } from "../../shared/apiClient.js";

// apiRequest requires a schema for every call; DELETE /users/notifications/:id returns
// a 204 with no body, so there's nothing to validate — no need to pull in zod here just
// to express "nothing", since apiClient.ts's Schema<T> interface only needs a `.parse`.
const voidSchema = { parse: (): void => undefined };

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
    requestAccountDeletion: (accessToken: string): Promise<AccountDeletionResponse> =>
      apiRequest(apiUrl, "/users/account-deletion", accountDeletionResponseSchema, { method: "POST", accessToken }),
    getNotifications: (accessToken: string): Promise<NotificationResponse[]> =>
      apiRequest(apiUrl, "/users/notifications", notificationListResponseSchema, { method: "GET", accessToken }),
    markNotificationRead: (accessToken: string, id: string): Promise<NotificationResponse> =>
      apiRequest(apiUrl, `/users/notifications/${id}/read`, notificationResponseSchema, { method: "PUT", accessToken }),
    clearNotification: (accessToken: string, id: string): Promise<void> =>
      apiRequest(apiUrl, `/users/notifications/${id}`, voidSchema, { method: "DELETE", accessToken }),
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
