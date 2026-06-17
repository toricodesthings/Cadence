/**
 * Canonical structured logger for Cloudflare Workers Logs (Observability).
 *
 * When `observability` is enabled in wrangler.jsonc, the Workers runtime
 * automatically captures and persists everything written to `console.*` and
 * ingests it into Workers Logs — visible, indexed, and filterable directly in
 * the dashboard. No `wrangler tail` is required to see what went wrong.
 *
 * Two rules make the dashboard useful rather than a wall of text:
 *
 *  1. Log the OBJECT, never a JSON string. Workers Logs deserializes a logged
 *     object and indexes each field, so you can filter `status:500` or
 *     `event:upstream_failed` instantly. A stringified payload collapses into a
 *     single opaque `message` blob that can only be text-matched.
 *     (https://developers.cloudflare.com/workers/observability/logs/workers-logs/#logging-structured-json-objects)
 *
 *  2. One concise line per event. The per-invocation capture budget is 256 KB;
 *     after that the runtime silently drops further context for the request.
 *
 * Level → console method → CF severity, and when to use each:
 *   error → console.error → "error"   5xx, unhandled throws, dependency outages
 *   warn  → console.warn  → "warning" 4xx client faults, invalid input, best-effort failures
 *   info  → console.info  → "info"    rare operational milestones (e.g. cron summaries)
 *
 * Happy paths (2xx/3xx) MUST NOT log — Cloudflare already emits an invocation
 * log per request (`invocation_logs`), so success coverage is free. Keep this
 * channel strictly signal: errors and warnings only.
 */

export type LogLevel = "error" | "warn" | "info";

/** Subsystem that emitted the event — a low-cardinality dimension to filter on. */
export type LogSource = "http" | "auth" | "cron" | "proxy" | "ai";

export type LogFields = Record<string, unknown>;

export type IssueSummary = {
    code: string;
    message: string;
    path: string;
};

/** Cap a free-text value so one runaway field cannot blow the 256 KB budget. */
const MESSAGE_MAX_LENGTH = 120;

export function shorten(value: string): string {
    return value.length > MESSAGE_MAX_LENGTH
        ? `${value.slice(0, MESSAGE_MAX_LENGTH - 3)}...`
        : value;
}

/**
 * Hash an identifier to a stable 16-char hex prefix so user/session IDs are
 * correlatable across logs without ever persisting PII in Observability.
 */
export async function hashIdentifier(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 16);
}

/**
 * Flatten an unknown thrown value (and its `cause`) into indexable issue
 * summaries so a log line points at the actual failure. Returns undefined for
 * non-Error values, which omits the field entirely.
 */
export function issuesFromError(error: unknown): IssueSummary[] | undefined {
    if (!(error instanceof Error)) return undefined;
    const issues: IssueSummary[] = [
        { code: error.name || "Error", message: shorten(error.message), path: "" },
    ];
    if (error.cause instanceof Error) {
        issues.push({
            code: error.cause.name || "Cause",
            message: shorten(error.cause.message),
            path: "cause",
        });
    }
    return issues;
}

function emit(level: LogLevel, source: LogSource, event: string, fields: LogFields) {
    // Object — not a string — so Workers Logs indexes each field. See module header.
    const payload = { event, level, source, ...fields };

    if (level === "error") {
        console.error(payload);
        return;
    }
    if (level === "warn") {
        console.warn(payload);
        return;
    }
    console.info(payload);
}

/**
 * Structured logger. Every call produces exactly one indexed Workers Logs entry
 * carrying a stable `event` discriminator plus whatever `fields` you pass.
 *
 *   logger.error("proxy", "upstream_failed", { upstream: "nominatim", status: 503 });
 *   logger.warn("http", "recurrence_rule_invalid", { rule, issues });
 */
export const logger = {
    error: (source: LogSource, event: string, fields: LogFields = {}) => emit("error", source, event, fields),
    warn: (source: LogSource, event: string, fields: LogFields = {}) => emit("warn", source, event, fields),
    info: (source: LogSource, event: string, fields: LogFields = {}) => emit("info", source, event, fields),
};
