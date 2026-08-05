import { z } from "zod";

// Story 1.3: a fixed, ordered contract both apps/web and core rely on — unlike
// calculateAge (Story 1.2), this needs no independent computation on either side, just
// agreement on an ordered list, so it lives here once rather than being hand-duplicated.
export const ONBOARDING_STEPS = ["goal", "interests", "availability", "sessionLength", "targetDate", "level"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const learnerLevelSchema = z.enum(["beginner", "intermediate", "advanced"]);

export type LearnerLevel = z.infer<typeof learnerLevelSchema>;

export const availabilitySchema = z.object({
  monday: z.number().min(0).max(24),
  tuesday: z.number().min(0).max(24),
  wednesday: z.number().min(0).max(24),
  thursday: z.number().min(0).max(24),
  friday: z.number().min(0).max(24),
  saturday: z.number().min(0).max(24),
  sunday: z.number().min(0).max(24),
});

export type Availability = z.infer<typeof availabilitySchema>;

export const learnerProfileResponseSchema = z.object({
  goal: z.string().nullable(),
  interests: z.array(z.string()).nullable(),
  availability: availabilitySchema.nullable(),
  sessionLengthMinutes: z.number().nullable(),
  targetCompletionDate: z.string().nullable(),
  level: learnerLevelSchema.nullable(),
  currentStep: z.number().int().min(0).max(ONBOARDING_STEPS.length),
  completedAt: z.string().nullable(),
});

export type LearnerProfileResponse = z.infer<typeof learnerProfileResponseSchema>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// One discriminated union shared by both client (pre-submit validation) and server
// (parseOrThrow at the route layer) — a step's value shape is meaningless without
// knowing which step it belongs to, so validating them separately would be weaker.
export const onboardingStepInputSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("goal"), value: z.string().trim().min(1).max(500) }),
  // Bounded the same way every other step's value is (review finding: this was the one
  // step with no upper limit at all).
  z.object({ step: z.literal("interests"), value: z.array(z.string().trim().min(1).max(100)).min(1).max(20) }),
  z.object({ step: z.literal("availability"), value: availabilitySchema }),
  z.object({ step: z.literal("sessionLength"), value: z.number().int().min(10).max(180) }),
  // The one step whose value may be null (explicit skip) — omitting it entirely is
  // still rejected, forcing the client to make an explicit choice either way.
  z.object({
    step: z.literal("targetDate"),
    value: z.iso
      .date()
      .nullable()
      .refine((value) => value === null || value >= todayIso(), { message: "targetCompletionDate cannot be in the past" }),
  }),
  z.object({ step: z.literal("level"), value: learnerLevelSchema }),
]);

export type OnboardingStepInput = z.infer<typeof onboardingStepInputSchema>;
