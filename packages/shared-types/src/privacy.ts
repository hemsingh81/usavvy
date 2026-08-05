import { z } from "zod";

export const learnerPrivacySettingsSchema = z.object({
  publicLeaderboardSharing: z.boolean(),
  cohortDisplayName: z.boolean(),
  uploadsForTraining: z.boolean(),
});

export type LearnerPrivacySettings = z.infer<typeof learnerPrivacySettingsSchema>;

// FR-A-6's own literal, explicit defaults — not a product judgment call the way
// Story 1.4's speechRate/boardTheme defaults were.
export const DEFAULT_PRIVACY_SETTINGS: LearnerPrivacySettings = {
  publicLeaderboardSharing: false,
  cohortDisplayName: true,
  uploadsForTraining: false,
};

export const privacySettingsUpdateInputSchema = z
  .object({
    publicLeaderboardSharing: z.boolean().optional(),
    cohortDisplayName: z.boolean().optional(),
    uploadsForTraining: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one privacy setting must be provided" });

export type PrivacySettingsUpdateInput = z.infer<typeof privacySettingsUpdateInputSchema>;
