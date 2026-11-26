import { z } from "zod";
import { localDateSchema } from "./common";

export const TIME_OF_DAY = ["early", "morning", "afternoon", "evening", "late"] as const;
export const timeOfDaySchema = z.enum(TIME_OF_DAY);
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

export const findTimeSchema = z.object({
    shown: z.array(timeOfDaySchema).max(8).optional(),
    undo: z.boolean().optional(),
});
export type FindTimeBody = z.infer<typeof findTimeSchema>;

export const PLANNING_OFFERS = ["steps", "later"] as const;
export const planningOfferSchema = z.enum(PLANNING_OFFERS);
export type PlanningOffer = z.infer<typeof planningOfferSchema>;

export const planningOfferOutcomeSchema = z.object({
    taskId: z.uuid(),
    kind: planningOfferSchema,
    outcome: z.enum(["chosen", "declined"]),
});
export type PlanningOfferOutcome = z.infer<typeof planningOfferOutcomeSchema>;

export const planningOffersSchema = z.object({
    steps: z.array(z.uuid()),
    later: z.array(z.uuid()),
});
export type PlanningOffers = z.infer<typeof planningOffersSchema>;

export const statedWhenSchema = z.object({
    buckets: z.array(timeOfDaySchema).min(1).max(5),
    about: z.string().trim().min(2).max(60).nullable(),
});
export type StatedWhenInput = z.infer<typeof statedWhenSchema>;

export const planningEvidenceSchema = z.object({
    records: z.array(
        z.object({
            chosen: timeOfDaySchema,
            feasible: z.array(timeOfDaySchema),
            suggested: z.boolean(),
            saidOn: localDateSchema,
            projectId: z.uuid().nullable(),
        }),
    ),
    stated: z.array(statedWhenSchema),
});
export type PlanningEvidence = z.infer<typeof planningEvidenceSchema>;

export const STEP_MAX_CHARS = 80;

export const suggestStepsSchema = z.object({
    taskId: z.uuid(),
    smaller: z.array(z.string().max(STEP_MAX_CHARS)).min(1).max(7).optional(),
});
export type SuggestStepsInput = z.infer<typeof suggestStepsSchema>;
export const suggestedStepsSchema = z.object({ steps: z.array(z.string().max(STEP_MAX_CHARS)).min(1).max(7) });

export const RESET_SUGGESTION_MAX = 30;

export const RESET_DISPOSITIONS = {
    captures: ["today", "this_week", "next_week", "later", "none"],
    unscheduled: ["today", "this_week", "next_week", "later", "none"],
    waiting: ["activate", "keep_waiting", "none"],
} as const;
export const resetDispositionSchema = z.enum(["today", "this_week", "next_week", "later", "activate", "keep_waiting"]);
export type ResetDisposition = z.infer<typeof resetDispositionSchema>;

export const resetSuggestionsRequestSchema = z.object({
    step: z.enum(["captures", "loose_ends"]),
    ids: z.array(z.uuid()).min(1).max(RESET_SUGGESTION_MAX),
});
export type ResetSuggestionsRequest = z.infer<typeof resetSuggestionsRequestSchema>;
export const resetSuggestionsSchema = z.object({ suggestions: z.record(z.string(), resetDispositionSchema) });
export type ResetSuggestions = z.infer<typeof resetSuggestionsSchema>;
