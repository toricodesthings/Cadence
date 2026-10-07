import { z } from "zod";

// ── Time: one model (see the root AGENTS.md "Time" section) ──
// A field is exactly one of these four types, never a date-or-datetime union.

const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/** Whether `value` is an IANA zone name this runtime knows (`@cadence/domain/time` re-exports it). */
export function isZone(value: unknown): value is string {
    if (typeof value !== "string" || !ZONE_SHAPE.test(value)) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

/** Instant: one exact moment, ISO-8601 with an offset or `Z`. Timed starts and ends, reminders, audit times. */
export const instantSchema = z.iso.datetime({ offset: true });
/** LocalDate: a calendar day, `YYYY-MM-DD`, no time and no zone. All-day days, deadlines, hide-until, routine days. */
export const localDateSchema = z.iso.date();
/** WallTime: `HH:MM`, read with the day and zone it belongs to. */
export const wallTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Zone: an IANA name (`America/Toronto`). Never an offset, never "local". */
export const zoneSchema = z.string().max(64).refine(isZone, "Must be an IANA time zone, e.g. America/Toronto");

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
    // Account
    "ACCOUNT_DELETION_UNAVAILABLE",
    "REAUTH_FAILED",
    "DATA_EXPORT_UNAVAILABLE",
    // Assistant
    "AI_RATE_LIMITED",
    "AI_IMAGE_LIMITED",
    "AI_IMAGE_PENDING_LIMIT",
    "AI_TIMEOUT",
    "AI_ABORTED",
    "AI_UPSTREAM_UNAVAILABLE",
    "AI_TOOL_FAILED",
    "AI_CONTENT_BLOCKED",
    // Push
    "PUSH_UNAVAILABLE",
    // Server
    "UPSTREAM_ERROR",
    "SEED_FAILED",
    "INTERNAL_ERROR",
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** A server code, or one the client makes when a response can't be read or the server can't be reached. */
export const clientErrorCodeSchema = z.union([errorCodeSchema, z.enum(["UNKNOWN_ERROR", "UNPARSEABLE_ERROR", "NETWORK_UNAVAILABLE"])]);
export type ClientErrorCode = z.infer<typeof clientErrorCodeSchema>;

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
