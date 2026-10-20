import { z } from "zod";
import { localDateSchema } from "./common";

/** The parts of a day plans fall in, for "when you like to do things". Local hour: <9 early · <12 morning · <17 afternoon · <21 evening · late. */
export const TIME_OF_DAY = ["early", "morning", "afternoon", "evening", "late"] as const;
export const timeOfDaySchema = z.enum(TIME_OF_DAY);
export type TimeOfDay = z.infer<typeof timeOfDaySchema>;

/**
 * Sent with a task write that Cadence proposed (Find a time, Later today, Place's receipt time): `shown` is the
 * buckets of the proposals the person has seen so far in that run, so a pick after comparing teaches and a first
 * proposal kept as is doesn't. `undo` deletes the run's record.
 */
export const findTimeSchema = z.object({
    shown: z.array(timeOfDaySchema).max(8).optional(),
    undo: z.boolean().optional(),
});
export type FindTimeBody = z.infer<typeof findTimeSchema>;

/** The two things Cadence may offer on a task that keeps slipping or waits. */
export const PLANNING_OFFERS = ["steps", "later"] as const;
export const planningOfferSchema = z.enum(PLANNING_OFFERS);
export type PlanningOffer = z.infer<typeof planningOfferSchema>;

/** `POST /ai/memory/planning/offer`: the person did the offered thing (`chosen`) or pressed Not now (`declined`). */
export const planningOfferOutcomeSchema = z.object({
    taskId: z.uuid(),
    kind: planningOfferSchema,
    outcome: z.enum(["chosen", "declined"]),
});
export type PlanningOfferOutcome = z.infer<typeof planningOfferOutcomeSchema>;

/** `GET /ai/memory/planning/offers`: the tasks each offer may show on, after every decline rule. Empty outside Full. */
export const planningOffersSchema = z.object({
    steps: z.array(z.uuid()),
    later: z.array(z.uuid()),
});
export type PlanningOffers = z.infer<typeof planningOffersSchema>;

/** "I study after dinner": a stated time-of-day preference, with the topic it is about (null = anything). */
export const statedWhenSchema = z.object({
    buckets: z.array(timeOfDaySchema).min(1).max(5),
    about: z.string().trim().min(2).max(60).nullable(),
});
export type StatedWhenInput = z.infer<typeof statedWhenSchema>;

/**
 * `GET /ai/memory/planning-evidence`: what Find a time orders by, computed on the device with the same pure rule as
 * the server (`@cadence/domain/slot-preference`). `records` only in Full; `stated` whenever
 * memory is on. Newest first.
 */
export const planningEvidenceSchema = z.object({
    records: z.array(z.object({
        chosen: timeOfDaySchema,
        feasible: z.array(timeOfDaySchema),
        suggested: z.boolean(),
        saidOn: localDateSchema,
        projectId: z.uuid().nullable(),
    })),
    stated: z.array(statedWhenSchema),
});
export type PlanningEvidence = z.infer<typeof planningEvidenceSchema>;

/** A drafted first step's longest length. */
export const STEP_MAX_CHARS = 80;

/**
 * `POST /ai/steps`: a few small first steps drafted for a task, from its title, notes, list and existing steps only.
 * `smaller` carries the draft the person saw, to be broken down finer once. Nothing is stored: Keep writes subtasks.
 */
export const suggestStepsSchema = z.object({
    taskId: z.uuid(),
    smaller: z.array(z.string().max(STEP_MAX_CHARS)).min(1).max(7).optional(),
});
export type SuggestStepsInput = z.infer<typeof suggestStepsSchema>;
export const suggestedStepsSchema = z.object({ steps: z.array(z.string().max(STEP_MAX_CHARS)).min(1).max(7) });
