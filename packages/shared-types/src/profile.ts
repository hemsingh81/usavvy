import { z } from "zod";

// Story 1.5 (FR-A-5). No AC/NFR specifies a bound — 60 is a product judgment call,
// shorter than `goal`'s 500/`interests`' 100 since a display name is conventionally short.
export const displayNameSchema = z.string().trim().min(1).max(60);

export const updateDisplayNameInputSchema = z.object({ displayName: displayNameSchema });

export type UpdateDisplayNameInput = z.infer<typeof updateDisplayNameInputSchema>;
