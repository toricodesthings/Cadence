import { z } from "zod";

const ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

export function isZone(value: unknown): value is string {
    if (typeof value !== "string" || !ZONE_SHAPE.test(value)) return false;
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

export const instantSchema = z.iso.datetime({ offset: true });
export const localDateSchema = z.iso.date();
export const wallTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
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

export const ERROR_CODES = [
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
    "INVALID_TASK_SCHEDULE",
    "INVALID_RECURRENCE_RULE",
    "INVALID_SECTION",
    "INVALID_SCENARIO",
    "NOTE_TOO_LONG",
    "IMAGE_NOT_FOUND",
    "IMAGE_TOO_LARGE",
    "FILE_UNSUPPORTED",
    "FILE_LOCKED",
    "FILE_TOO_LONG",
    "UNSUPPORTED_IMAGE",
    "STORAGE_UNAVAILABLE",
    "STORAGE_FULL",
    "ACCOUNT_DELETION_UNAVAILABLE",
    "REAUTH_FAILED",
    "DATA_EXPORT_UNAVAILABLE",
    "AI_RATE_LIMITED",
    "AI_IMAGE_LIMITED",
    "AI_IMAGE_PENDING_LIMIT",
    "AI_SPEND_CAPPED",
    "AI_TIMEOUT",
    "AI_ABORTED",
    "AI_UPSTREAM_UNAVAILABLE",
    "AI_TOOL_FAILED",
    "AI_CONTENT_BLOCKED",
    "VIEW_ONLY",
    "OWNER_ONLY",
    "LINK_EXPIRED",
    "SHARE_LIMIT",
    "TAKE_SELF_ONLY",
    "SHARED_READ_ONLY",
    "STALE_WRITE",
    "MODE_SET",
    "PUSH_UNAVAILABLE",
    "UPSTREAM_ERROR",
    "SEED_FAILED",
    "INTERNAL_ERROR",
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const clientErrorCodeSchema = z.union([
    errorCodeSchema,
    z.enum(["UNKNOWN_ERROR", "UNPARSEABLE_ERROR", "NETWORK_UNAVAILABLE"]),
]);
export type ClientErrorCode = z.infer<typeof clientErrorCodeSchema>;

export const apiIssueSchema = z.object({ code: z.string(), message: z.string(), path: z.string() });
export type ApiIssue = z.infer<typeof apiIssueSchema>;

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
