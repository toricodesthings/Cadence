import type { Context } from "hono";
import { tracing } from "cloudflare:workers";
import { logger, hashIdentifier, shorten, issuesFromError, type IssueSummary, type LogLevel } from "./log";

const REQUEST_ID_HEADER = "x-request-id";

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
    "projectId",
    "priority",
    "isPinned",
    "archived",
    "status",
    "orderIndex",
    "taskIds",
]);

const PARAM_SUMMARY_KEYS = new Set(["id", "tagId"]);

function summarizeValue(key: string, value: unknown) {
    if (value === undefined) return undefined;

    if (typeof value === "string") {
        if (key === "title") return value.length;
        return shorten(value);
    }

    if (Array.isArray(value)) {
        return value.length;
    }

    return value;
}

function sanitizeRecord(data: Record<string, unknown>, allowedKeys: Set<string>) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export function getRequestId(c: Context<any>) {
    return c.get("requestId");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
function getRouteLabel(c: Context<any>) {
    return c.req.routePath || c.req.path;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export function setRequestErrorCode(c: Context<any>, errorCode: string) {
    c.set("errorCode", errorCode);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
function markLogged(c: Context<any>) {
    c.set("logged", true);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
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

const MAX_CLIENT_REQUEST_ID_LENGTH = 128;

const CLIENT_REQUEST_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sanitizeClientRequestId(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_CLIENT_REQUEST_ID_LENGTH) return undefined;
    if (!CLIENT_REQUEST_ID_PATTERN.test(trimmed)) return undefined;
    return trimmed;
}

export function createRequestContext() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    return async (c: Context<any>, next: () => Promise<void>) => {
        const requestId = crypto.randomUUID();

        const clientRequestId = sanitizeClientRequestId(c.req.header(REQUEST_ID_HEADER));

        c.set("requestId", requestId);
        c.set("requestStartedAt", Date.now());

        await tracing.enterSpan("http.response", async (span) => {
            await next();
            const responseMs = Date.now() - c.get("requestStartedAt");
            span.setAttribute("http.response_ms", responseMs);
            c.header("Server-Timing", `app;dur=${responseMs}`);
        });

        c.header(REQUEST_ID_HEADER, requestId);

        const status = c.res.status;

        if (status < 400 || status === 401 || status === 404 || c.get("logged")) {
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export async function logValidationFailure(c: Context<any>, target: string, issues: IssueSummary[], rawData: unknown) {
    const requestId = getRequestId(c);
    const record = rawData && typeof rawData === "object" ? (rawData as Record<string, unknown>) : {};
    const allowedKeys =
        target === "json" ? JSON_SUMMARY_KEYS : target === "param" ? PARAM_SUMMARY_KEYS : QUERY_SUMMARY_KEYS;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export async function logErrorResponse(c: Context<any>, error: unknown, status: number, errorCode: string) {
    const requestId = getRequestId(c);

    markLogged(c);
    logger[levelForStatus(status)]("http", "request_failed", {
        ...(await baseLogFields(c, requestId)),
        status,
        errorCode,
        issues: issuesFromError(error),
    });
}
