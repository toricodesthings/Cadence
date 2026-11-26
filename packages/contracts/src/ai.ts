import { z } from "zod";
import { errorCodeSchema, instantSchema, type ErrorCode } from "./common";

export const MAX_PARTS_PER_MESSAGE = 32;

export const MAX_MESSAGE_CHARS = 8_000;

export const streamErrorSchema = z.object({
    code: errorCodeSchema,
    message: z.string(),
    isRetryable: z.boolean(),
    requestId: z.string().optional(),
});
export type StreamError = z.infer<typeof streamErrorSchema>;

export const AI_ERROR_CODES = {
    INVALID_REQUEST: { status: 400, isRetryable: false },
    AI_RATE_LIMITED: { status: 429, isRetryable: true },
    AI_IMAGE_LIMITED: { status: 429, isRetryable: false },
    AI_SPEND_CAPPED: { status: 429, isRetryable: false },
    IMAGE_NOT_FOUND: { status: 404, isRetryable: false },
    AI_TIMEOUT: { status: 504, isRetryable: true },
    AI_ABORTED: { status: null, isRetryable: true },
    AI_UPSTREAM_UNAVAILABLE: { status: 503, isRetryable: true },
    AI_TOOL_FAILED: { status: null, isRetryable: true },
    AI_CONTENT_BLOCKED: { status: null, isRetryable: false },
    INTERNAL_ERROR: { status: 500, isRetryable: true },
} as const satisfies Partial<Record<ErrorCode, { status: number | null; isRetryable: boolean }>>;
export type AiErrorCode = keyof typeof AI_ERROR_CODES;

export const messageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;
export const messageStatusSchema = z.enum(["streaming", "complete", "failed", "aborted"]);
export type MessageStatus = z.infer<typeof messageStatusSchema>;

const uiMessagePartSchema = z.object({ type: z.string().min(1) }).catchall(z.unknown());

export const uiMessageSchema = z.object({
    id: z.string().min(1).max(128),
    role: messageRoleSchema,
    parts: z.array(uiMessagePartSchema).max(MAX_PARTS_PER_MESSAGE).default([]),
    metadata: z.record(z.string(), z.unknown()).optional(),
});

export const userMessageSchema = uiMessageSchema.extend({ role: z.literal("user") });

export const assistantMessageSchema = uiMessageSchema.extend({ role: z.literal("assistant") });

export const approvalModeSchema = z.enum(["ask", "auto", "full"]);
export type ApprovalMode = z.infer<typeof approvalModeSchema>;

export const toolApprovalDecisionSchema = z.object({
    id: z.string().min(1).max(128),
    approved: z.boolean(),
    reason: z.string().max(300).optional(),
});
export type ToolApprovalDecision = z.infer<typeof toolApprovalDecisionSchema>;

export const chatSurfaceSchema = z.enum(["weekly_reset"]);
export type ChatSurface = z.infer<typeof chatSurfaceSchema>;

export const chatRequestSchema = z
    .object({
        conversationId: z.uuid().optional(),
        message: userMessageSchema.optional(),
        approvals: z.array(toolApprovalDecisionSchema).min(1).max(50).optional(),
        timezone: z.string().optional(),
        currentDate: z.string().describe("ISO timestamp representing user's current clock time"),
        locale: z.string().min(2).max(35).optional(),
        clientMessageId: z.string().max(64).optional(),
        approvalMode: approvalModeSchema.default("ask"),
        surface: chatSurfaceSchema.optional(),
        editAnchorId: z.string().min(1).max(128).nullable().optional(),
    })
    .refine((v) => !v.message !== !v.approvals, "Send a message or approvals, not both")
    .refine((v) => !v.approvals || v.conversationId, "Approvals need a conversationId");

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
        learn: z.boolean().optional(),
    })
    .refine((d) => d.title !== undefined || d.archived !== undefined || d.learn !== undefined, {
        message: "At least one of `title`, `archived` or `learn` is required",
    });

export const stopStreamSchema = z.object({
    activeStreamId: z.string().optional(),
    assistantMessage: assistantMessageSchema.optional(),
});
export type StopStreamRequest = z.infer<typeof stopStreamSchema>;

export const aiConversationRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    title: z.string().nullable(),
    model: z.string().nullable(),
    lastMessageAt: instantSchema.nullable(),
    archived: z.boolean(),
    metadata: z.record(z.string(), z.unknown()),
    activeStreamId: z.string().nullable(),
    lastStreamId: z.string().nullable(),
    lastStreamStatus: z.string().nullable(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});

export const conversationSchema = aiConversationRowSchema;

export const conversationListItemSchema = conversationSchema
    .pick({ id: true, title: true, lastMessageAt: true, archived: true })
    .extend({ learn: z.boolean() });
export type ConversationListItem = z.infer<typeof conversationListItemSchema>;

export const conversationDetailSchema = conversationSchema
    .pick({
        id: true,
        title: true,
        model: true,
        lastMessageAt: true,
        archived: true,
        activeStreamId: true,
        lastStreamId: true,
        lastStreamStatus: true,
    })
    .extend({ learn: z.boolean() });
export type ConversationDetail = z.infer<typeof conversationDetailSchema>;
export type Conversation = z.infer<typeof conversationSchema>;

export const CONVERSATION_TITLE_DATA_TYPE = "data-conversation-title" as const;

export const conversationTitleDataSchema = z.object({
    conversationId: z.uuid(),
    title: z.string().min(1).max(200),
});
export type ConversationTitleData = z.infer<typeof conversationTitleDataSchema>;

export const aiMessageRowSchema = z.object({
    id: z.string(),
    conversationId: z.uuid(),
    userId: z.uuid(),
    role: messageRoleSchema,
    parts: z.array(z.unknown()),
    metadata: z.record(z.string(), z.unknown()),
    status: messageStatusSchema,
    orderIndex: z.number(),
    searchText: z.string().nullable(),
    createdAt: instantSchema,
});

export const messageSchema = uiMessageSchema;
export type Message = z.infer<typeof messageSchema>;

export const aiUsageWindowSchema = z.object({
    requests: z.object({ used: z.number(), limit: z.number() }),
    tokens: z.object({ used: z.number(), limit: z.number() }),
    resetEpoch: z.number().nullable(),
});
export type AiUsageWindow = z.infer<typeof aiUsageWindowSchema>;

export const CHAT_IMAGE_LIMITS = {
    perMessage: 4,
    maxBytes: 1024 * 1024,
    maxDimension: 1600,
    serverMaxDimension: 2048,
    maxOriginalBytes: 25 * 1024 * 1024,
} as const;

export const CHAT_IMAGE_SCHEME = "cadence-image:";
export const CHAT_IMAGE_MEDIA_TYPE = "image/webp";
export const CHAT_PDF_MEDIA_TYPE = "application/pdf";

export const CHAT_FILE_LIMITS = { pdfMaxBytes: 5 * 1024 * 1024, pdfMaxPages: 30 } as const;

export function chatImageUrl(id: string): string {
    return `${CHAT_IMAGE_SCHEME}${id}`;
}

export function parseChatImageUrl(url: unknown): string | null {
    if (typeof url !== "string" || !url.startsWith(CHAT_IMAGE_SCHEME)) return null;
    const id = url.slice(CHAT_IMAGE_SCHEME.length);
    return z.uuid().safeParse(id).success ? id : null;
}

export const aiImageUsageSchema = z.object({
    used: z.number(),
    limit: z.number(),
    perMessage: z.number(),
    resetEpoch: z.number().nullable(),
});
export type AiImageUsage = z.infer<typeof aiImageUsageSchema>;

export const chatImageUploadResponseSchema = z.object({
    id: z.uuid(),
    reused: z.boolean(),
    mediaType: z.enum([CHAT_IMAGE_MEDIA_TYPE, CHAT_PDF_MEDIA_TYPE]),
    pages: z.number().int().nullable(),
    images: aiImageUsageSchema.omit({ perMessage: true }),
});
export type ChatImageUpload = z.infer<typeof chatImageUploadResponseSchema>;

export const chatImageReportSchema = z.object({ requestId: z.string().max(128).optional() });

export const aiImageRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    conversationId: z.uuid(),
    contentHash: z.string(),
    bytes: z.number(),
    mediaType: z.enum([CHAT_IMAGE_MEDIA_TYPE, CHAT_PDF_MEDIA_TYPE]),
    pages: z.number().int().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    createdAt: instantSchema,
    sentAt: instantSchema.nullable(),
    lastUsedAt: instantSchema,
    diagnosticsSharedAt: instantSchema.nullable(),
});

export const aiUsageSchema = z.object({
    enabled: z.boolean(),
    windows: z.object({
        "5h": aiUsageWindowSchema,
        "7d": aiUsageWindowSchema,
    }),
    images: aiImageUsageSchema,
});
export type AiUsage = z.infer<typeof aiUsageSchema>;
