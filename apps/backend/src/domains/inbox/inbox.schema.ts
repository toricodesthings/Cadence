import { z } from "zod";
import { canonicalNlpEnvelopeSchema, sourceSurfaceSchema } from "../tasks/tasks.schema";

export const captureKindSchema = z.enum(["task", "thought", "reference", "unknown"]);
export const captureStatusSchema = z.enum(["clarifying", "placed", "kept", "discarded"]);
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
