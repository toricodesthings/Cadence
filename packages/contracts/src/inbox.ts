import { z } from "zod";
import { canonicalNlpEnvelopeSchema, sourceSurfaceSchema } from "./task";

const isoDateTime = z.iso.datetime({ offset: true });

export const captureKindSchema = z.enum(["task", "thought", "reference", "unknown"]);
export type CaptureKind = z.infer<typeof captureKindSchema>;
export const captureStatusSchema = z.enum(["clarifying", "placed", "kept", "discarded"]);
export type CaptureStatus = z.infer<typeof captureStatusSchema>;
export const inboxAnalysisStatusSchema = z.enum(["pending", "parsed", "reviewed", "applied"]);
export type InboxAnalysisStatus = z.infer<typeof inboxAnalysisStatusSchema>;

export const insertInboxItemSchema = z.object({
    rawText: z.string().min(1).max(5_000),
    sectionId: z.string().uuid().optional(),
    orderIndex: z.number().optional(),
    captureKind: captureKindSchema.optional(),
});
export type InsertInboxItem = z.infer<typeof insertInboxItemSchema>;

export const updateInboxItemSchema = z.object({
    rawText: z.string().min(1).max(5_000).optional(),
    sectionId: z.string().uuid().nullable().optional(),
    orderIndex: z.number().optional(),
    captureKind: captureKindSchema.optional(),
    captureStatus: captureStatusSchema.optional(),
    placedTaskId: z.string().uuid().nullable().optional(),
    aiSuggestion: z.string().max(10_000).nullable().optional(),
    processed: z.boolean().optional(),
    // NLP analysis fields
    analysisStatus: inboxAnalysisStatusSchema.optional(),
    analysisVersion: z.string().max(20).optional(),
    analysisSummary: z.string().max(1_000).optional(),
    analysis: z.record(z.string(), z.unknown()).optional(),
    sourceSurface: sourceSurfaceSchema.optional(),
});
export type UpdateInboxItem = z.infer<typeof updateInboxItemSchema>;

/** Schema for the atomic inbox→task processing endpoint */
export const processInboxItemSchema = z.object({
    title: z.string().min(1).max(2_000),
    scheduledDate: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullish(),
    dueDate: z.iso.date().nullish(),
    scheduledStart: z.iso.datetime({ offset: true }).nullish(),
    scheduledEnd: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullish(),
    isAllDay: z.boolean().nullish(),
    projectId: z.string().uuid().nullish(),
    tagIds: z.array(z.string().uuid()).nullish(),
    priority: z.number().int().min(0).max(4).nullish(),
    durationEstimate: z.number().int().min(1).max(480).nullish(),
    recurrenceRule: z.string().max(500).nullish(),
    waitingOn: z.string().max(200).nullish(),
    nlp: canonicalNlpEnvelopeSchema.nullish(),
    parseResult: z.record(z.string(), z.unknown()).nullish(),
});
export type ProcessInboxItem = z.infer<typeof processInboxItemSchema>;

export const insertInboxSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number().optional(),
});
export type InsertInboxSection = z.infer<typeof insertInboxSectionSchema>;

export const updateInboxSectionSchema = insertInboxSectionSchema.partial();
export type UpdateInboxSection = z.infer<typeof updateInboxSectionSchema>;

// ── Row schemas (exact DB columns) ──
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
    analysisConfidenceTier: z.enum(["high", "medium", "low"]).nullable(),
    analysisNeedsReview: z.boolean(),
    analysisReviewReason: z.string().nullable(),
    analysisEntityCount: z.number().int(),
    clarifiedAt: isoDateTime.nullable(),
    appliedAt: isoDateTime.nullable(),
    createdAt: isoDateTime,
});
export type InboxItemRow = z.infer<typeof inboxItemRowSchema>;

// Client entity: the analysis-lifecycle columns are optional (optimistic caches
// and older consumers omit them); the Row keeps them required for DB parity.
export const inboxItemSchema = inboxItemRowSchema.extend({
    analysisConfidenceTier: z.enum(["high", "medium", "low"]).nullable().optional(),
    analysisNeedsReview: z.boolean().optional(),
    analysisReviewReason: z.string().nullable().optional(),
    analysisEntityCount: z.number().int().optional(),
    clarifiedAt: isoDateTime.nullable().optional(),
    appliedAt: isoDateTime.nullable().optional(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

export const inboxSectionRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    orderIndex: z.number().int(),
    createdAt: isoDateTime,
});
export type InboxSectionRow = z.infer<typeof inboxSectionRowSchema>;

export const inboxSectionSchema = inboxSectionRowSchema;
export type InboxSection = z.infer<typeof inboxSectionSchema>;
