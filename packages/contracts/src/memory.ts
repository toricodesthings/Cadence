import { z } from "zod";
import { instantSchema, localDateSchema } from "./common";

/** How much the assistant remembers. `null` (in settings) means the person hasn't chosen yet. */
export const memoryModeSchema = z.enum(["off", "basic", "full"]);
export type MemoryMode = z.infer<typeof memoryModeSchema>;

/** The revision of the memory wording the person agreed to (picker copy + Terms/Privacy). */
export const MEMORY_CONSENT_VERSION = "2026-10-12";

export const MEMORY_KINDS = ["preference", "quirk", "life", "constraint", "pattern", "duration", "assist"] as const;
export const memoryKindSchema = z.enum(MEMORY_KINDS);
export type MemoryKind = z.infer<typeof memoryKindSchema>;

/** Kinds only Full learns (from activity). */
export const FULL_ONLY_KINDS: readonly MemoryKind[] = ["pattern", "duration"];

export const memorySourceSchema = z.enum(["explicit", "chat", "note", "activity", "backfill"]);
export type MemorySource = z.infer<typeof memorySourceSchema>;

export const memoryConfidenceSchema = z.enum(["stated", "observed", "inferred"]);
export type MemoryConfidence = z.infer<typeof memoryConfidenceSchema>;

export const MEMORY_CONTENT_MAX = 300;
export const MEMORY_LABEL_MAX = 60;

/** One remembered fact as the page and the tools show it. `content` is plain text with any date written in. */
export const memoryFactSchema = z.object({
    id: z.uuid(),
    kind: memoryKindSchema,
    content: z.string().max(MEMORY_CONTENT_MAX),
    /** First mention: what makes "you mentioned in August" true. */
    saidOn: localDateSchema,
    lastSeenOn: localDateSchema,
    seenCount: z.number().int(),
    validThrough: localDateSchema.nullable(),
    source: memorySourceSchema,
    confidence: memoryConfidenceSchema,
    sensitive: z.boolean(),
    pinned: z.boolean(),
    /** The chat it came from, when it came from one. */
    conversationId: z.uuid().nullable(),
});
export type MemoryFact = z.infer<typeof memoryFactSchema>;

/** `GET /ai/memory`. Forgotten items come back as topic labels only. */
export const memoryPageSchema = z.object({
    mode: memoryModeSchema.nullable(),
    choiceAt: instantSchema.nullable(),
    /** Stored items are shown but not used while the mode is off (or unchosen). */
    inactive: z.boolean(),
    /**
     * Full's read of the last 3 months: a rough share done (chats by how far back it has read, then notes) and
     * what it learned. Kept for a week after it finishes, for the "Done" line; null otherwise.
     */
    catchUp: z.object({
        progress: z.number().min(0).max(1),
        learned: z.number().int().min(0),
        doneAt: instantSchema.nullable(),
    }).nullable(),
    facts: z.array(memoryFactSchema),
    forgotten: z.array(z.object({ id: z.uuid(), label: z.string() })),
});
export type MemoryPage = z.infer<typeof memoryPageSchema>;

/** `POST /ai/memory/mode`. The server stamps the choice time and bumps the epoch. */
export const setMemoryModeSchema = z.object({
    mode: memoryModeSchema,
    consentVersion: z.string().max(40),
});
export type SetMemoryMode = z.infer<typeof setMemoryModeSchema>;

/** How long something took, as the person said it: one number, or a range ("30-60"). */
export const durationValueSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("point"), minutes: z.number().int().min(1).max(1440) }),
    z.object({ kind: z.literal("range"), lowMinutes: z.number().int().min(1).max(1440), highMinutes: z.number().int().min(1).max(1440) })
        .refine((v) => v.lowMinutes < v.highMinutes, "low must be below high"),
]);
export type DurationValue = z.infer<typeof durationValueSchema>;

/**
 * `POST /ai/memory/duration`. `completedAt` names the completion; only pre-0.36.0 desktop builds omit it (they bind to
 * the task's current one) and send `minutes` instead of `value`. A second answer for the same completion replaces the first.
 */
export const durationReportSchema = z.object({
    taskId: z.uuid(),
    completedAt: instantSchema.optional(),
    value: durationValueSchema.optional(),
    minutes: z.number().int().min(1).max(1440).optional(),
    /** The answer came from the relative stage ("About right", Shorter, Longer). */
    anchored: z.boolean().default(false),
    /** The question's token, when answering the question (resets the back-off). */
    token: z.string().max(100).optional(),
}).refine((r) => (r.value ? 1 : 0) + (r.minutes ? 1 : 0) === 1, "value or minutes");
export type DurationReport = z.input<typeof durationReportSchema>;

/** What the server stored: the Took row and the toast render this, never their own draft. */
export const durationReportViewSchema = z.object({
    taskId: z.uuid(),
    completedAt: instantSchema,
    lowMinutes: z.number().int(),
    highMinutes: z.number().int(),
    anchored: z.boolean(),
});
export type DurationReportView = z.infer<typeof durationReportViewSchema>;

/** `POST /ai/memory/duration/ask`: should the toast be shown for this just-completed task? */
export const durationAskSchema = z.object({ taskId: z.uuid() });
export const durationAskResultSchema = z.union([
    z.object({ ask: z.literal(false) }),
    z.object({ ask: z.literal(true), token: z.string(), completedAt: instantSchema, reference: z.number().int().positive().nullable() }),
]);
export type DurationAskResult = z.infer<typeof durationAskResultSchema>;

/** `POST /ai/memory/duration/shown`: the toast rendered. One miss per token. */
export const durationShownSchema = z.object({ token: z.string().min(1).max(100) });

/** `GET|DELETE /ai/memory/duration`: one completion's report. Without `completedAt` it is the task's current completion. */
export const durationTaskSchema = z.object({ taskId: z.uuid(), completedAt: instantSchema.optional() });

/** `GET /ai/memory/duration-evidence`: the person's reports as estimator input (Full only, else []). Newest first, at most 1,000. */
export const durationEvidenceRowSchema = z.object({
    taskId: z.uuid(),
    title: z.string(),
    projectId: z.uuid().nullable(),
    /** The task repeats: the same task id is the same thing. */
    series: z.boolean(),
    lowMinutes: z.number().int(),
    highMinutes: z.number().int(),
    anchored: z.boolean(),
    saidOn: localDateSchema,
});
export type DurationEvidenceRow = z.infer<typeof durationEvidenceRowSchema>;

/** `DELETE /ai/memory` query: also switch memory off. */
export const clearMemoryQuerySchema = z.object({
    turnOff: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});

/** What `remember` hands back, and the chat shows as "Remembered: … · Undo". `kept`: it was already known (seen once more), so there is nothing to undo. */
export const memoryReceiptSchema = z.object({
    ok: z.literal(true),
    action: z.enum(["saved", "kept", "updated", "forgot"]),
    id: z.uuid(),
    text: z.string(),
});
export type MemoryReceipt = z.infer<typeof memoryReceiptSchema>;
