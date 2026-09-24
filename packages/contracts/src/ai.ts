import { z } from "zod";
import { isoDateTimeSchema } from "./common";

/** Upper bound on UIMessage parts. Per-part byte caps are enforced server-side. */
export const MAX_PARTS_PER_MESSAGE = 32;

/**
 * Max summed length of all text parts in a single message. Single source of
 * truth for BOTH halves: the backend guard rejects with 400, the frontend
 * composer blocks the send with an inline notice before the request.
 */
export const MAX_MESSAGE_CHARS = 8_000;

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

/**
 * The incoming chat turn MUST be a user message. Role is pinned at the schema
 * level so a crafted request can never persist an "assistant"/"system" row into
 * history and have it replayed into model context as elevated instructions.
 */
export const userMessageSchema = uiMessageSchema.extend({ role: z.literal("user") });

/** An assistant-role message snapshot (stop-endpoint partial persistence). */
export const assistantMessageSchema = uiMessageSchema.extend({ role: z.literal("assistant") });

/** Chat request — load-by-id: the latest user message (or approval answers) + conversationId. */
/** Composer approval mode: ask first · auto (all but permanent deletes) · full (everything). */
export const approvalModeSchema = z.enum(["ask", "auto", "full"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

/** The user's answer to one tool approval the assistant is waiting on. */
export const toolApprovalDecisionSchema = z.object({
    id: z.string().min(1).max(128),
    approved: z.boolean(),
    /** Why it was declined, for the model (e.g. "user removed Buy milk"). */
    reason: z.string().max(300).optional(),
});
export type ToolApprovalDecision = z.infer<typeof toolApprovalDecisionSchema>;

export const chatRequestSchema = z.object({
    conversationId: z.string().uuid().optional(),
    /** The new user turn. Omitted when the request only answers approvals. */
    message: userMessageSchema.optional(),
    /** Answers to the approvals the last assistant message waits on; the turn then continues. */
    approvals: z.array(toolApprovalDecisionSchema).min(1).max(50).optional(),
    timezone: z.string().default("UTC"),
    currentDate: z.string().describe("ISO timestamp representing user's current clock time"),
    /** BCP-47 locale of the client (e.g. "en-CA") — feeds runtime prompt context. */
    locale: z.string().min(2).max(35).optional(),
    clientMessageId: z.string().max(64).optional(),
    /** The composer's approval mode, rendered into the prompt's Environment. */
    approvalMode: approvalModeSchema.default("ask"),
    /**
     * Edit-truncation anchor. Sent ONLY on an explicit message edit: the id of
     * the last message the client kept (rows after it are dropped server-side
     * so the edited-away tail can't resurrect on reload), or null when the
     * FIRST message was edited (the whole thread restarts). Omitted on normal
     * sends/regenerates — regeneration anchors on the re-sent message id itself.
     */
    editAnchorId: z.string().min(1).max(128).nullable().optional(),
})
    .refine((v) => !v.message !== !v.approvals, "Send a message or approvals, not both")
    .refine((v) => !v.approvals || v.conversationId, "Approvals need a conversationId");
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
    // Role pinned to "assistant": the snapshot may only ever land as an aborted
    // assistant turn, never as a forged user/system row. The server additionally
    // verifies the id matches the live stream's assistant message id.
    assistantMessage: assistantMessageSchema.optional(),
});
export type StopStreamRequest = z.infer<typeof stopStreamSchema>;


// ── Conversation entity (Row + entity) ──
export const aiConversationRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string().nullable(),
    model: z.string().nullable(),
    lastMessageAt: isoDateTimeSchema.nullable(),
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
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
});
export type AiConversationRow = z.infer<typeof aiConversationRowSchema>;

export const conversationSchema = aiConversationRowSchema;
export type Conversation = z.infer<typeof conversationSchema>;

// ── Auto-title streaming (data part) ──
// On the FIRST turn of a new conversation the backend generates a short title in
// parallel with the reply and streams it back as a TRANSIENT UIMessage data part
// (delivered to `useChat({ onData })`, never persisted into message.parts). The
// title itself is persisted separately on `ai_conversations.title`.
export const CONVERSATION_TITLE_DATA_TYPE = "data-conversation-title" as const;

export const conversationTitleDataSchema = z.object({
    conversationId: z.uuid(),
    title: z.string().min(1).max(200),
});
export type ConversationTitleData = z.infer<typeof conversationTitleDataSchema>;

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
    createdAt: isoDateTimeSchema,
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
