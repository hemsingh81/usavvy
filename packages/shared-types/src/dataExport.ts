import { z } from "zod";
import { meResponseSchema } from "./auth.js";
import { learnerProfileResponseSchema } from "./users.js";
import { learnerPreferencesSchema } from "./preferences.js";
import { learnerPrivacySettingsSchema } from "./privacy.js";

// Review finding: this originally hand-redeclared the same six fields already defined
// on meResponseSchema — the exact "reuse, don't redeclare" principle this file's own
// comment states for the other three sections, just not applied here. .pick() derives
// this from the single source of truth instead of a second, independently-maintained copy.
const dataExportAccountSchema = meResponseSchema.pick({
  id: true,
  email: true,
  displayName: true,
  memberSince: true,
  birthdate: true,
  role: true,
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
