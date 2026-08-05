import { z } from "zod";

// DC-3 (DESIGN.md) — Board Dark (default) vs. Board Light "Paper". Deliberately distinct
// from FR-A-9's separate 4-preset app-wide color theme (its own, later story/control).
export const boardThemeSchema = z.enum(["dark", "paper"]);

export type BoardTheme = z.infer<typeof boardThemeSchema>;

// FR-A-4's literal parenthetical.
export const explanationStyleSchema = z.enum(["concise", "detailed", "example-first", "analogy-first"]);

export type ExplanationStyle = z.infer<typeof explanationStyleSchema>;

// Every field is required — unlike onboarding's learnerProfileResponseSchema, there is
// no "not yet answered" state for a preference; GET always returns a fully-populated,
// immediately-actionable object.
export const learnerPreferencesSchema = z.object({
  voiceEnabled: z.boolean(),
  speechRate: z.number(),
  boardTheme: boardThemeSchema,
  explanationStyle: explanationStyleSchema,
  captionsEnabled: z.boolean(),
  reducedMotion: z.boolean(),
});

export type LearnerPreferences = z.infer<typeof learnerPreferencesSchema>;

// Product judgment calls — no AC/NFR specifies exact defaults or a speechRate range.
export const DEFAULT_LEARNER_PREFERENCES: LearnerPreferences = {
  voiceEnabled: true,
  speechRate: 1,
  boardTheme: "dark",
  explanationStyle: "concise",
  captionsEnabled: false,
  reducedMotion: false,
};

// A PUT updates whatever subset of controls the learner just touched (instant-apply per
// control, matching EXPERIENCE.md's Theme Picker precedent) — not the whole form at once.
export const preferencesUpdateInputSchema = z
  .object({
    voiceEnabled: z.boolean().optional(),
    speechRate: z.number().min(0.5).max(2).optional(),
    boardTheme: boardThemeSchema.optional(),
    explanationStyle: explanationStyleSchema.optional(),
    captionsEnabled: z.boolean().optional(),
    reducedMotion: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one preference must be provided" });

export type PreferencesUpdateInput = z.infer<typeof preferencesUpdateInputSchema>;
