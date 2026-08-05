import { z } from "zod";

// Story 1.10 (FR-A-10). A notification with no sourceProcessType is never tied to a
// process — always clearable. One tied to a process carries a status alongside it
// (AD-18: "is this resolved" is a lookup against this record, not a guess).
export const notificationSourceProcessStatusSchema = z.enum(["in_progress", "resolved"]);

export type NotificationSourceProcessStatus = z.infer<typeof notificationSourceProcessStatusSchema>;

export const notificationResponseSchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  sourceProcessType: z.string().nullable(),
  sourceProcessStatus: notificationSourceProcessStatusSchema.nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type NotificationResponse = z.infer<typeof notificationResponseSchema>;

export const notificationListResponseSchema = z.array(notificationResponseSchema);
