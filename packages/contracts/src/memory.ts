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
    /** Full is reading the last 3 months of chats and notes: "Getting to know you". */
    gettingToKnowYou: z.boolean(),
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

/** `POST /ai/memory/duration`: how long a task took, as the person says. */
export const durationReportSchema = z.object({
    taskId: z.uuid(),
    minutes: z.number().int().min(1).max(24 * 60),
});
export type DurationReport = z.infer<typeof durationReportSchema>;

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
