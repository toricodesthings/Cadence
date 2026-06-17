import { z } from "zod";
import { createTaskInputSchema } from "./task";

const isoDateTime = z.iso.datetime({ offset: true });

/** Upper bound on UIMessage parts. Per-part byte caps are enforced server-side. */
export const MAX_PARTS_PER_MESSAGE = 32;

// ── Message role / status enums (canonical; mapper imports these) ──
export const messageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;
export const messageStatusSchema = z.enum(["streaming", "complete", "failed", "aborted"]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

/**
 * A single UIMessage part. Only a `type` discriminator is required; the rest is
 * passed through (tool/data/text parts vary). Hard size/shape caps live in the
 * server-side pre-agent guard.
 */
const uiMessagePartSchema = z.object({ type: z.string().min(1) }).catchall(z.unknown());

/** A persisted-fidelity UIMessage: { id, role, parts, metadata }. */
export const uiMessageSchema = z.object({
    id: z.string().min(1).max(128),
    role: messageRoleSchema,
    parts: z.array(uiMessagePartSchema).max(MAX_PARTS_PER_MESSAGE).default([]),
    metadata: z.record(z.string(), z.unknown()).optional(),
});
export type UIMessageInput = z.infer<typeof uiMessageSchema>;

/** Chat request — load-by-id: client sends the latest user message + conversationId. */
export const chatRequestSchema = z
    .object({
        conversationId: z.string().uuid().optional(),
        message: uiMessageSchema.optional(),
        messages: z.array(uiMessageSchema).optional(), // legacy (deprecated)
        timezone: z.string().default("UTC"),
        currentDate: z.string().describe("ISO timestamp representing user's current clock time"),
        clientMessageId: z.string().max(64).optional(),
    })
    .refine((d) => !!d.message || (Array.isArray(d.messages) && d.messages.length > 0), {
        message: "Either `message` or a non-empty `messages` array is required",
        path: ["message"],
    });
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// ── Conversation management endpoints ──
export const conversationIdParamSchema = z.object({ id: z.string().uuid() });

export const listConversationsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
});

export const conversationMessagesQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    before: z.coerce.number().optional(),
});

export const conversationPatchSchema = z
    .object({
        title: z.string().max(200).optional(),
        archived: z.boolean().optional(),
    })
    .refine((d) => d.title !== undefined || d.archived !== undefined, {
        message: "At least one of `title` or `archived` is required",
    });
export type ConversationPatch = z.infer<typeof conversationPatchSchema>;

/**
 * Stop-stream request — hard-aborts the in-flight turn for a conversation.
 * `activeStreamId` (from `GET /conversations/:id`) guards against stopping a
 * newer turn the client doesn't know about; `assistantMessage` optionally
 * persists the partial snapshot the client already rendered. See doc Update 4 §7.9.
 */
export const stopStreamSchema = z.object({
    activeStreamId: z.string().optional(),
    assistantMessage: uiMessageSchema.optional(),
});
export type StopStreamRequest = z.infer<typeof stopStreamSchema>;

// ── Conversation entity (Row + entity) ──
export const aiConversationRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string().nullable(),
    model: z.string().nullable(),
    lastMessageAt: isoDateTime.nullable(),
    archived: z.boolean(),
    metadata: z.record(z.string(), z.unknown()),
    // Non-null while a turn is producing — lets the client hydrate `resume` (doc Update 4 §7.10).
    activeStreamId: z.string().nullable(),
    // The most recently FINISHED stream + its terminal status ("complete" | "failed" |
    // "aborted"). When there's no live stream, the client can still re-attach to
    // `lastStreamId` to grace-replay the just-finished chunk-log (alive ~60s), and use
    // the status to drive Retry. Typed as the raw text column (parity with `activeStreamId`).
    lastStreamId: z.string().nullable(),
    lastStreamStatus: z.string().nullable(),
    createdAt: isoDateTime,
    updatedAt: isoDateTime,
});
export type AiConversationRow = z.infer<typeof aiConversationRowSchema>;

export const conversationSchema = aiConversationRowSchema;
export type Conversation = z.infer<typeof conversationSchema>;

// ── Message Row (for parity guard). The client entity is the UIMessage projection. ──
export const aiMessageRowSchema = z.object({
    id: z.string(),
    conversationId: z.uuid(),
    userId: z.uuid(),
    role: messageRoleSchema,
    parts: z.array(z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    status: messageStatusSchema,
    orderIndex: z.number(),
    createdAt: isoDateTime,
});
export type AiMessageRow = z.infer<typeof aiMessageRowSchema>;

/** Client-facing message entity — the UIMessage projection (no status/orderIndex). */
export const messageSchema = uiMessageSchema;
export type Message = z.infer<typeof messageSchema>;

// ── AI usage budget (rate-limit transparency; GET /ai/usage) ──
// One rolling window's used/limit on both dimensions + the reset epoch. Lets the UI
// render "≈ N messages left · resets in …" instead of only learning at rejection.
export const aiUsageWindowSchema = z.object({
    requests: z.object({ used: z.number(), limit: z.number() }),
    tokens: z.object({ used: z.number(), limit: z.number() }),
    /** Unix epoch (seconds) when this window resets, or null when no window is armed yet. */
    resetEpoch: z.number().nullable(),
});
export type AiUsageWindow = z.infer<typeof aiUsageWindowSchema>;

export const aiUsageSchema = z.object({
    /** False when the budget is not configured/reachable (used:0 placeholders). */
    enabled: z.boolean(),
    windows: z.object({
        "5h": aiUsageWindowSchema,
        "7d": aiUsageWindowSchema,
    }),
});
export type AiUsage = z.infer<typeof aiUsageSchema>;

// ── Widget / tool-output payloads (eliminates the assistant `any`) ──
export const taskProposalPartSchema = z.object({
    draft: createTaskInputSchema, // the AI's proposed task IS a CreateTaskInput
    rationale: z.string().optional(),
});
export type TaskProposalPart = z.infer<typeof taskProposalPartSchema>;

export const dangerConfirmPartSchema = z.object({
    action: z.string(),
    summary: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
});
export type DangerConfirmPart = z.infer<typeof dangerConfirmPartSchema>;
