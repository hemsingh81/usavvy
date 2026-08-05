import { ageDeclarationResponseSchema, parentalConsentResponseSchema, type AgeDeclarationResponse, type ParentalConsentResponse } from "@usavvy/shared-types";
import { apiRequest } from "../../shared/apiClient.js";

/** Thin typed fetch wrapper for gateway's /users/* routes. */
export function createUsersApi(apiUrl: string) {
  return {
    declareAge: (accessToken: string, input: { birthdate: string; parentEmail?: string }): Promise<AgeDeclarationResponse> =>
      apiRequest(apiUrl, "/users/age-declaration", ageDeclarationResponseSchema, { method: "POST", body: input, accessToken }),
    parentalConsent: (input: { token: string }): Promise<ParentalConsentResponse> =>
      apiRequest(apiUrl, "/users/parental-consent", parentalConsentResponseSchema, { method: "POST", body: input }),
  };
}

export type UsersApi = ReturnType<typeof createUsersApi>;
