import { z } from "zod";
import { instantSchema, localDateSchema } from "./common";
import { canonicalNlpEnvelopeSchema, effortLevelSchema, effortOriginSchema, sourceSurfaceSchema } from "./task";
import { CONFIDENCE_TIERS } from "@cadence/nlp/core";

export const inboxQuerySchema = z.object({ status: z.enum(["clarifying", "kept"]).default("clarifying") });

export const captureKindSchema = z.enum(["task", "thought", "reference", "unknown"]);
export const captureStatusSchema = z.enum(["clarifying", "placed", "kept", "discarded"]);
export const inboxAnalysisStatusSchema = z.enum(["pending", "parsed", "reviewed", "applied"]);

export const insertInboxItemSchema = z.object({
    id: z.uuid().optional(),
    rawText: z.string().trim().min(1).max(5_000),
    sectionId: z.uuid().optional(),
    orderIndex: z.number().optional(),
    captureKind: captureKindSchema.optional(),
});

export const updateInboxItemSchema = z.object({
    rawText: z.string().trim().min(1).max(5_000).optional(),
    sectionId: z.uuid().nullable().optional(),
    orderIndex: z.number().optional(),
    captureKind: captureKindSchema.optional(),
    captureStatus: z.enum(["clarifying", "kept", "discarded"]).optional(),
    aiSuggestion: z.string().max(10_000).nullable().optional(),
    analysisStatus: inboxAnalysisStatusSchema.optional(),
    analysisVersion: z.string().max(20).optional(),
    analysisSummary: z.string().max(1_000).optional(),
    analysis: z.record(z.string(), z.unknown()).optional(),
    sourceSurface: sourceSurfaceSchema.optional(),
});
export type UpdateInboxItem = z.infer<typeof updateInboxItemSchema>;
export type UpdateInboxItemInput = z.input<typeof updateInboxItemSchema>;

export const processInboxItemSchema = z.object({
    taskId: z.uuid().optional(),
    title: z.string().trim().min(1).max(2_000),
    complete: z.boolean().optional(),
    scheduledDay: localDateSchema.nullish(),
    dueDate: localDateSchema.nullish(),
    endDate: localDateSchema.nullish(),
    scheduledStart: instantSchema.nullish(),
    scheduledEnd: instantSchema.nullish(),
    projectId: z.uuid().nullish(),
    sectionId: z.uuid().nullish(),
    tagIds: z.array(z.uuid()).nullish(),
    priority: z.number().int().min(0).max(4).nullish(),
    effort: effortLevelSchema.nullish(),
    effortOrigin: effortOriginSchema.optional(),
    durationEstimate: z.number().int().min(1).max(480).nullish(),
    recurrenceRule: z.string().max(500).nullish(),
    waitingOn: z.string().max(200).nullish(),
    reminderAt: instantSchema.nullish(),
    notBefore: localDateSchema.nullish(),
    nlp: canonicalNlpEnvelopeSchema.nullish(),
    parseResult: z.record(z.string(), z.unknown()).nullish(),
});
export type ProcessInboxItem = z.infer<typeof processInboxItemSchema>;

export const insertInboxSectionSchema = z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(200),
    orderIndex: z.number().optional(),
});

export const updateInboxSectionSchema = insertInboxSectionSchema.omit({ id: true }).partial();
export type UpdateInboxSectionInput = z.input<typeof updateInboxSectionSchema>;

export const inboxItemRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    sectionId: z.uuid().nullable(),
    orderIndex: z.number().int(),
    rawText: z.string(),
    processed: z.boolean(),
    captureKind: captureKindSchema,
    captureStatus: captureStatusSchema,
    placedTaskId: z.uuid().nullable(),
    aiSuggestion: z.string().nullable(),
    analysisStatus: z.enum(["pending", "parsed", "reviewed", "applied", "dismissed"]).nullable(),
    analysisVersion: z.string().nullable(),
    analysisSummary: z.string().nullable(),
    analysis: z.record(z.string(), z.unknown()).nullable(),
    sourceSurface: sourceSurfaceSchema.nullable(),
    analysisConfidenceTier: z.enum(CONFIDENCE_TIERS).nullable(),
    analysisNeedsReview: z.boolean(),
    analysisReviewReason: z.string().nullable(),
    analysisEntityCount: z.number().int(),
    clarifiedAt: instantSchema.nullable(),
    appliedAt: instantSchema.nullable(),
    createdAt: instantSchema,
});
export type InboxItemRow = z.infer<typeof inboxItemRowSchema>;

export const inboxItemSchema = inboxItemRowSchema.extend({
    analysisConfidenceTier: z.enum(CONFIDENCE_TIERS).nullable().optional(),
    analysisNeedsReview: z.boolean().optional(),
    analysisReviewReason: z.string().nullable().optional(),
    analysisEntityCount: z.number().int().optional(),
    clarifiedAt: instantSchema.nullable().optional(),
    appliedAt: instantSchema.nullable().optional(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const inboxSectionRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    orderIndex: z.number().int(),
    createdAt: instantSchema,
});

export const suggestedPlacementSchema = z.object({
    projectId: z.uuid(),
    sectionId: z.uuid().nullable(),
    model: z.string(),
    probability: z.number(),
    costUsd: z.number().optional(),
    ms: z.number().optional(),
});
export type SuggestedPlacement = z.infer<typeof suggestedPlacementSchema>;

export const suggestedPriorityFromWordsSchema = z.object({
    priority: z.number().int().min(1).max(4),
    model: z.string(),
    probability: z.number(),
});
export type SuggestedPriorityFromWords = z.infer<typeof suggestedPriorityFromWordsSchema>;

export const suggestedEffortSchema = z.object({
    effort: z.number().int().min(1).max(3),
    model: z.string(),
    probability: z.number(),
});
export type SuggestedEffort = z.infer<typeof suggestedEffortSchema>;
