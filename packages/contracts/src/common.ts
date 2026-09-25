import { z } from "zod";

/** ISO-8601 datetime with an offset — the wire format for every timestamp. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** A date-only (`YYYY-MM-DD`) or full ISO datetime, for fields shared by all-day and timed values. */
export const flexibleDateTimeSchema = z.union([z.iso.date(), isoDateTimeSchema]);

export const paginationSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
});

export const uuidParamSchema = z.object({ id: z.uuid() });
export const taskIdParamSchema = z.object({ taskId: z.uuid() });

export interface ApiResponse<T> {
    data: T;
    meta?: { total?: number; limit?: number; offset?: number };
}

/**
 * Every error code the API sends. `AppError`, `DomainError` and the stream-error
 * contract all take one of these, so a typo or rename fails `tsc` on both sides.
 */
export const ERROR_CODES = [
    // Request and auth
    "INVALID_REQUEST",
    "VALIDATION_ERROR",
    "PAYLOAD_TOO_LARGE",
    "TOO_MANY_REQUESTS",
    "UNAUTHORIZED",
    "TOKEN_EXPIRED",
    "INVALID_ISSUER",
    "INVALID_AUDIENCE",
    "AUTH_MISCONFIGURED",
    "AUTH_PROVIDER_UNAVAILABLE",
    "FORBIDDEN",
    "NOT_FOUND",
    "CONFLICT",
    // Domain rules
    "INVALID_TASK_SCHEDULE",
    "INVALID_RECURRENCE_RULE",
    "INVALID_SECTION",
    "INVALID_SCENARIO",
    "NOTE_TOO_LONG",
    // Images and storage
    "IMAGE_NOT_FOUND",
    "IMAGE_TOO_LARGE",
    "UNSUPPORTED_IMAGE",
    "STORAGE_UNAVAILABLE",
    // Assistant
    "AI_RATE_LIMITED",
    "AI_IMAGE_LIMITED",
    "AI_IMAGE_PENDING_LIMIT",
    "AI_TIMEOUT",
    "AI_ABORTED",
    "AI_UPSTREAM_UNAVAILABLE",
    "AI_TOOL_FAILED",
    "AI_CONTENT_BLOCKED",
    // Server
    "UPSTREAM_ERROR",
    "SEED_FAILED",
    "INTERNAL_ERROR",
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiIssueSchema = z.object({ code: z.string(), message: z.string(), path: z.string() });
export type ApiIssue = z.infer<typeof apiIssueSchema>;

/** The JSON body of every non-2xx response. */
export const apiErrorSchema = z.object({
    error: z.object({
        code: errorCodeSchema,
        message: z.string(),
        status: z.number().int(),
        isRetryable: z.boolean(),
        requestId: z.string().optional(),
        issues: z.array(apiIssueSchema).optional(),
    }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
