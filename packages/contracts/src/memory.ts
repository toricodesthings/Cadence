import { z } from "zod";
import { instantSchema, localDateSchema, wallTimeSchema } from "./common";

export const memoryModeSchema = z.enum(["off", "basic", "full"]);
export type MemoryMode = z.infer<typeof memoryModeSchema>;

export const MEMORY_KINDS = ["preference", "quirk", "life", "constraint", "pattern", "duration", "assist"] as const;
export const memoryKindSchema = z.enum(MEMORY_KINDS);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

export const FULL_ONLY_KINDS: readonly MemoryKind[] = ["pattern", "duration"];

export const memorySourceSchema = z.enum(["explicit", "chat", "note", "activity", "backfill"]);
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const memoryConfidenceSchema = z.enum(["stated", "observed", "inferred"]);
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;

export const MEMORY_CONTENT_MAX = 300;
export const MEMORY_LABEL_MAX = 60;

export const memoryFactSchema = z.object({
    id: z.uuid(),
    kind: memoryKindSchema,
    content: z.string().max(MEMORY_CONTENT_MAX),
    saidOn: localDateSchema,
    lastSeenOn: localDateSchema,
    seenCount: z.number().int(),
    validThrough: localDateSchema.nullable(),
    source: memorySourceSchema,
    confidence: memoryConfidenceSchema,
    sensitive: z.boolean(),
    pinned: z.boolean(),
    conversationId: z.uuid().nullable(),
});
export type MemoryFact = z.infer<typeof memoryFactSchema>;

export const MEMORY_PAGE_SIZE = 30;
export const memoryPageQuerySchema = z.object({ cursor: z.string().max(200).optional() });

export const memoryPageSchema = z.object({
    mode: memoryModeSchema.nullable(),
    choiceAt: instantSchema.nullable(),
    inactive: z.boolean(),
    catchUp: z
        .object({
            progress: z.number().min(0).max(1),
            learned: z.number().int().min(0),
            doneAt: instantSchema.nullable(),
        })
        .nullable(),
    facts: z.array(memoryFactSchema),
    nextCursor: z.string().nullable(),
    forgotten: z.array(z.object({ id: z.uuid(), label: z.string() })),
});
export type MemoryPage = z.infer<typeof memoryPageSchema>;

export const setMemoryModeSchema = z.object({
    mode: memoryModeSchema,
});
export type SetMemoryMode = z.infer<typeof setMemoryModeSchema>;

export const durationValueSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("point"), minutes: z.number().int().min(1).max(1440) }),
    z
        .object({
            kind: z.literal("range"),
            lowMinutes: z.number().int().min(1).max(1440),
            highMinutes: z.number().int().min(1).max(1440),
        })
        .refine((v) => v.lowMinutes < v.highMinutes, "low must be below high"),
]);
export type DurationValue = z.infer<typeof durationValueSchema>;

export const durationReportSchema = z.object({
    taskId: z.uuid(),
    completedAt: instantSchema,
    value: durationValueSchema,
    anchored: z.boolean().default(false),
    token: z.string().max(100).optional(),
});
export type DurationReport = z.input<typeof durationReportSchema>;

export const durationReportViewSchema = z.object({
    taskId: z.uuid(),
    completedAt: instantSchema,
    lowMinutes: z.number().int(),
    highMinutes: z.number().int(),
    anchored: z.boolean(),
});
export type DurationReportView = z.infer<typeof durationReportViewSchema>;

export const routineDurationKeySchema = z.object({
    habitId: z.uuid(),
    day: localDateSchema,
    time: wallTimeSchema.nullable().optional(),
});
export type RoutineDurationKey = z.infer<typeof routineDurationKeySchema>;
export const routineDurationSchema = routineDurationKeySchema.extend({
    value: durationValueSchema,
    anchored: z.boolean().default(false),
});
export type RoutineDuration = z.input<typeof routineDurationSchema>;
export const routineDurationQuerySchema = z.object({
    habitId: z.uuid(),
    day: localDateSchema,
    time: wallTimeSchema.optional(),
});
export const routineDurationViewSchema = z.object({
    habitId: z.uuid(),
    day: localDateSchema,
    time: wallTimeSchema.nullable(),
    lowMinutes: z.number().int(),
    highMinutes: z.number().int(),
    anchored: z.boolean(),
});
export type RoutineDurationView = z.infer<typeof routineDurationViewSchema>;

export const durationAskSchema = z.object({ taskId: z.uuid() });
export const durationAskResultSchema = z.union([
    z.object({ ask: z.literal(false) }),
    z.object({
        ask: z.literal(true),
        token: z.string(),
        completedAt: instantSchema,
        reference: z.number().int().positive().nullable(),
    }),
]);
export type DurationAskResult = z.infer<typeof durationAskResultSchema>;

export const durationShownSchema = z.object({ token: z.string().min(1).max(100) });

export const durationTaskSchema = z.object({ taskId: z.uuid(), completedAt: instantSchema.optional() });

export const durationEvidenceRowSchema = z.object({
    taskId: z.uuid(),
    title: z.string(),
    projectId: z.uuid().nullable(),
    series: z.boolean(),
    lowMinutes: z.number().int(),
    highMinutes: z.number().int(),
    anchored: z.boolean(),
    saidOn: localDateSchema,
});
export type DurationEvidenceRow = z.infer<typeof durationEvidenceRowSchema>;

export const clearMemoryQuerySchema = z.object({
    turnOff: z
        .enum(["true", "false"])
        .optional()
        .transform((value) => value === "true"),
});

export const memoryReceiptSchema = z.object({
    ok: z.literal(true),
    action: z.enum(["saved", "kept", "updated", "forgot"]),
    id: z.uuid(),
    text: z.string(),
});
export type MemoryReceipt = z.infer<typeof memoryReceiptSchema>;
