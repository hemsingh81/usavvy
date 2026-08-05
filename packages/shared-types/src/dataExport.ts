import { z } from "zod";
import { learnerProfileResponseSchema } from "./users.js";
import { learnerPreferencesSchema } from "./preferences.js";
import { learnerPrivacySettingsSchema } from "./privacy.js";

const dataExportAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  memberSince: z.string(),
  birthdate: z.string().nullable(),
  role: z.string(),
});

// Story 1.8 (FR-A-8): an extensible top-level object — later epics (notes/progress/
// submissions, once Epic 3/4/6 ship) add their own top-level key here without this
// story's own sections needing to change.
export const dataExportSchema = z.object({
  account: dataExportAccountSchema,
  learnerProfile: learnerProfileResponseSchema,
  preferences: learnerPreferencesSchema,
  privacySettings: learnerPrivacySettingsSchema,
});

export type DataExport = z.infer<typeof dataExportSchema>;
