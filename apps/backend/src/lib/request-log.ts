import type { Context } from "hono";

export const REQUEST_ID_HEADER = "x-request-id";

const QUERY_SUMMARY_KEYS = new Set([
    "state",
    "projectId",
    "scheduledDate",
    "scheduledRangeStart",
    "scheduledRangeEnd",
    "priority",
    "isPinned",
    "effort",
    "notBeforeBefore",
    "hasNoDate",
    "hasNoProject",
    "effectiveOnOrBeforeDate",
    "archived",
    "start",
    "end",
    "year",
    "month",
    "limit",
    "offset",
]);

const JSON_SUMMARY_KEYS = new Set([
    "state",
    "isAllDay",
    "dueDate",
    "scheduledStart",
    "scheduledEnd",
    "projectId",
    "priority",
    "isPinned",
    "reminderAt",
    "reminderSilenced",
    "archived",
    "targetDate",
    "status",
    "orderIndex",
    "taskIds",
]);

const PARAM_SUMMARY_KEYS = new Set(["id", "tagId"]);

type LogLevel = "log" | "warn" | "error";

export type ValidationIssueSummary = {
    code: string;
    message: string;
    path: string;
};

type StructuredLogEvent = {
    event: string;
    level: LogLevel;
    requestId: string;
    method: string;
    path: string;
    status?: number;
    route: string;
    userHash: string | null;
    errorCode?: string;
    issues?: ValidationIssueSummary[];
    timingMs?: number;
    target?: string;
    input?: Record<string, unknown>;
};

function shorten(value: string) {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

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

async function hashIdentifier(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    return hash.slice(0, 16);
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

function emitStructuredLog(event: StructuredLogEvent) {
    const payload = JSON.stringify(event);

    if (event.level === "error") {
        console.error(payload);
        return;
    }

    if (event.level === "warn") {
        console.warn(payload);
        return;
    }

    console.log(payload);
}

function levelForStatus(status: number): LogLevel {
    if (status >= 500) return "error";
    if (status >= 400) return "warn";
    return "log";
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

export function createRequestContext() {
    return async (c: Context<any>, next: () => Promise<void>) => {
        const forwardedRequestId = c.req.header(REQUEST_ID_HEADER);
        const requestId = forwardedRequestId && forwardedRequestId.trim().length > 0 ? forwardedRequestId : crypto.randomUUID();

        c.set("requestId", requestId);
        c.set("requestStartedAt", Date.now());

        await next();

        c.header(REQUEST_ID_HEADER, requestId);

        const status = c.res.status;
        if (status < 400) {
            return;
        }

        const timingMs = Date.now() - c.get("requestStartedAt");
        const userId = c.var.userId;

        emitStructuredLog({
            event: "request_completed",
            level: levelForStatus(status),
            requestId,
            method: c.req.method,
            path: c.req.path,
            status,
            route: getRouteLabel(c),
            userHash: userId ? await hashIdentifier(userId) : null,
            errorCode: c.var.errorCode,
            timingMs,
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
    const userId = c.var.userId;
    const record = rawData && typeof rawData === "object" ? rawData as Record<string, unknown> : {};
    const allowedKeys = target === "json" ? JSON_SUMMARY_KEYS : target === "param" ? PARAM_SUMMARY_KEYS : QUERY_SUMMARY_KEYS;

    emitStructuredLog({
        event: "validation_failed",
        level: "warn",
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: 400,
        route: getRouteLabel(c),
        userHash: userId ? await hashIdentifier(userId) : null,
        errorCode: "INVALID_REQUEST",
        issues,
        target,
        timingMs: Date.now() - c.get("requestStartedAt"),
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
    const userId = c.var.userId;
    const issueList: ValidationIssueSummary[] = [];
    if (error instanceof Error) {
        issueList.push({
            code: error.name || "Error",
            message: shorten(error.message),
            path: "",
        });
        if (error.cause instanceof Error) {
            issueList.push({
                code: error.cause.name || "Cause",
                message: shorten(error.cause.message),
                path: "cause",
            });
        }
    }
    const issues = issueList.length > 0 ? issueList : undefined;

    emitStructuredLog({
        event: "request_failed",
        level: levelForStatus(status),
        requestId,
        method: c.req.method,
        path: c.req.path,
        status,
        route: getRouteLabel(c),
        userHash: userId ? await hashIdentifier(userId) : null,
        errorCode,
        issues,
        timingMs: Date.now() - c.get("requestStartedAt"),
    });
}
