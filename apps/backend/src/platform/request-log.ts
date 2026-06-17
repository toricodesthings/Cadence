import type { Context } from "hono";
import { logger, hashIdentifier, shorten, issuesFromError, type IssueSummary, type LogLevel } from "./log";

export const REQUEST_ID_HEADER = "x-request-id";

const QUERY_SUMMARY_KEYS = new Set([
    "state",
    "projectId",
    "priority",
    "isPinned",
    "effort",
    "archived",
    "limit",
    "offset",
]);

const JSON_SUMMARY_KEYS = new Set([
    "state",
    "isAllDay",
    "projectId",
    "priority",
    "isPinned",
    "archived",
    "status",
    "orderIndex",
    "taskIds",
]);

const PARAM_SUMMARY_KEYS = new Set(["id", "tagId"]);

/** Re-exported under the legacy name so domain code keeps importing from here. */
export type ValidationIssueSummary = IssueSummary;

function summarizeValue(key: string, value: unknown) {
    if (value === undefined) return undefined;

    if (key === "taskIds" && Array.isArray(value)) {
        return value.length;
    }

    if (typeof value === "string") {
        if (key === "title") return value.length;
        return shorten(value);
    }

    if (Array.isArray(value)) {
        return value.length;
    }

    return value;
}

function sanitizeRecord(
    data: Record<string, unknown>,
    allowedKeys: Set<string>,
) {
    const summary: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
        if (!allowedKeys.has(key)) continue;
        const nextKey = key === "taskIds" ? "taskIdsCount" : key;
        summary[nextKey] = summarizeValue(key, value);
    }

    return summary;
}

function levelForStatus(status: number): LogLevel {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    return "info";
}

export function getRequestId(c: Context<any>) {
    return c.get("requestId");
}

export function getRouteLabel(c: Context<any>) {
    return c.req.routePath || c.req.path;
}

export function setRequestErrorCode(c: Context<any>, errorCode: string) {
    c.set("errorCode", errorCode);
}

/**
 * Mark a request as already having an explicit failure log emitted, so the
 * request-context middleware does not emit a second `request_completed` line
 * for the same failure. This is what guarantees exactly one structured entry
 * per failed request regardless of whether the failure threw or returned.
 */
function markLogged(c: Context<any>) {
    c.set("logged", true);
}

/**
 * Shared envelope fields every structured log event carries: request
 * identity, the request line, the hashed user, and elapsed time.
 */
async function baseLogFields(c: Context<any>, requestId: string) {
    const userId = c.var.userId;
    return {
        requestId,
        method: c.req.method,
        path: c.req.path,
        route: getRouteLabel(c),
        userHash: userId ? await hashIdentifier(userId) : null,
        timingMs: Date.now() - c.get("requestStartedAt"),
    };
}

/**
 * Maximum length for a client-supplied request ID.
 * IDs exceeding this are discarded to prevent log pollution.
 */
const MAX_CLIENT_REQUEST_ID_LENGTH = 128;

/**
 * Strict pattern for acceptable client request IDs.
 * Only allows UUIDs, alphanumeric strings, hyphens, and underscores.
 */
const CLIENT_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sanitizeClientRequestId(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CLIENT_REQUEST_ID_LENGTH) return undefined;
    if (!CLIENT_REQUEST_ID_PATTERN.test(trimmed)) return undefined;
    return trimmed;
}

export function createRequestContext() {
    return async (c: Context<any>, next: () => Promise<void>) => {
        // Always generate a server-controlled canonical request ID
        const requestId = crypto.randomUUID();

        // Optionally preserve client correlation ID after strict validation
        const clientRequestId = sanitizeClientRequestId(c.req.header(REQUEST_ID_HEADER));

        c.set("requestId", requestId);
        c.set("requestStartedAt", Date.now());

        await next();

        // Return the server-generated ID — clients can use it for support/debugging
        c.header(REQUEST_ID_HEADER, requestId);

        const status = c.res.status;

        // Happy paths are intentionally silent — Cloudflare's invocation log
        // already covers 2xx/3xx. Skip too if an explicit failure log was
        // emitted (validation / onError), preventing a duplicate line.
        if (status < 400 || c.get("logged")) {
            return;
        }

        logger[levelForStatus(status)]("http", "request_completed", {
            ...(await baseLogFields(c, requestId)),
            status,
            errorCode: c.var.errorCode,
            ...(clientRequestId ? { clientRequestId } : {}),
        });
    };
}

export async function logValidationFailure(
    c: Context<any>,
    target: string,
    issues: ValidationIssueSummary[],
    rawData: unknown,
) {
    const requestId = getRequestId(c);
    const record = rawData && typeof rawData === "object" ? rawData as Record<string, unknown> : {};
    const allowedKeys = target === "json" ? JSON_SUMMARY_KEYS : target === "param" ? PARAM_SUMMARY_KEYS : QUERY_SUMMARY_KEYS;

    markLogged(c);
    logger.warn("http", "validation_failed", {
        ...(await baseLogFields(c, requestId)),
        status: 400,
        errorCode: "INVALID_REQUEST",
        issues,
        target,
        input: sanitizeRecord(record, allowedKeys),
    });
}

export async function logErrorResponse(
    c: Context<any>,
    error: unknown,
    status: number,
    errorCode: string,
) {
    const requestId = getRequestId(c);

    markLogged(c);
    logger[levelForStatus(status)]("http", "request_failed", {
        ...(await baseLogFields(c, requestId)),
        status,
        errorCode,
        issues: issuesFromError(error),
    });
}
