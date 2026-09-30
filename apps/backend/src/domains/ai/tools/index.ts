import { asSchema, jsonSchema } from "ai";
import type { Env } from "../../../types/env";
import { logger, hashIdentifier } from "../../../platform/log";
import { AppError } from "../../../platform/errors";
import { checkIdempotency, recordMutation, storedResult } from "../../../platform/idempotency";
import { DomainError } from "@cadence/domain/errors";
import type { Tx } from "../../../types/db";
import { taskTools } from "./tasks";
import { projectTools } from "./projects";
import { tagTools } from "./tags";
import { habitTools } from "./habits";
import { inboxTools } from "./inbox";
import { calendarTools } from "./calendar";
import { eventTools } from "./events";
import { metricTools } from "./metrics";
import { focusViewTools } from "./focus-views";
import { helpTools } from "./help";

/**
 * Runtime context captured per request when the tool registry is built.
 * Carries the user's clock/locale so the model can resolve relative dates
 * ("tomorrow", "next Tuesday") into the ISO-8601 values tools expect.
 * `userId` is intentionally NOT part of this — it is passed separately to every
 * factory and is never a model-supplied argument (doc 05 §1, §5).
 */
export interface AgentContext {
    /** The user's IANA timezone, validated (falls back to "UTC"), e.g. "America/Toronto". */
    timezone: string;
    /** The current instant from the user's clock, ISO-8601. */
    currentDate: string;
    /** The user's local calendar date, `YYYY-MM-DD` — what "today" means for every tool. */
    today: string;
    /** First day of the week, e.g. "Sunday" | "Monday" — informs week windows. */
    weekStart?: string;
    /** BCP-47 locale, e.g. "en-CA". */
    locale?: string;
    /** The turn's data-fence nonce, for user text a tool returns (notes). */
    nonce?: string;
    /** Return note text unfenced (MCP: the outside model owns its injection defence). */
    rawNotes?: boolean;
    /** Keeps post-commit metrics alive after the response (the Worker's `waitUntil`). */
    waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * The minimal, recoverable error object handed back to the model when a tool's
 * `execute` throws. It never carries raw row data — only a stable code the model
 * can reason about and apologize/recover from (doc 05 §5 "per-tool failure isolation").
 */
export interface ToolErrorResult {
    ok: false;
    error: string;
    tool: string;
}

/**
 * Wraps a tool `execute` body so a throw is converted into a structured error
 * result (instead of crashing the agent loop) and logged with a HASHED userId.
 * Raw user data is never logged. Reuse this in EVERY tool `execute`.
 */
export async function safeExecute<T>(
    toolName: string,
    userId: string,
    fn: () => Promise<T>,
): Promise<T | ToolErrorResult> {
    try {
        return await fn();
    } catch (error) {
        logger.warn("ai", "ai_tool_failed", {
            tool: toolName,
            userHash: await hashIdentifier(userId),
            // Only the error class/name — never the message body or row data.
            code: error instanceof Error ? error.name : "UnknownError",
        });
        // Our own 4xx messages ("Project not found", a stale note) are safe and tell
        // the model what to fix; anything else stays generic.
        const known = (error instanceof AppError && error.statusCode < 500) || error instanceof DomainError;
        return {
            ok: false,
            tool: toolName,
            error: known
                ? `${(error as Error).message}. Nothing was changed.`
                : `The "${toolName}" tool failed to run. Inform the user and offer to retry.`,
        };
    }
}

/**
 * Run a write once per tool call, keyed by the call id: a replayed call gets the
 * first call's result (its ids) plus `deduped: true` instead of writing again.
 * `id` is any row the write touched.
 */
export async function once<T>(
    tx: Tx,
    userId: string,
    toolCallId: string,
    write: () => Promise<{ result: T; id: string }>,
): Promise<T | { deduped: true }> {
    if (await checkIdempotency(tx, userId, toolCallId)) {
        return { ...(await storedResult(tx, userId, toolCallId) as object | undefined), deduped: true } as T & { deduped: true };
    }
    const { result, id } = await write();
    await recordMutation(tx, userId, toolCallId, id, result);
    return result;
}

/**
 * Hard, server-side cap applied to every list/read tool's `limit`, independent
 * of (and after) the model's argument. The model's argument is clamped again
 * here so a hallucinated huge limit can never widen the result set.
 */
export const MAX_LIST_LIMIT = 50;

/** Clamp a (possibly model-supplied) limit into [1, MAX_LIST_LIMIT]. */
export function clampLimit(limit: number | undefined, fallback = 20): number {
    const value = limit ?? fallback;
    if (!Number.isFinite(value)) return fallback;
    return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(value)));
}

/**
 * Assembles the full RLS-scoped tool surface for a single request. No global
 * state — call this once per turn with the authenticated `userId` (doc 05 §6).
 * The integration in agent.ts spreads the result into `streamText({ tools })`.
 */
export function buildToolRegistry(env: Env, userId: string, ctx: AgentContext) {
    return withoutPatterns({
        ...taskTools(env, userId, ctx),
        ...projectTools(env, userId, ctx),
        ...tagTools(env, userId, ctx),
        ...habitTools(env, userId, ctx),
        ...inboxTools(env, userId, ctx),
        ...calendarTools(env, userId, ctx),
        ...eventTools(env, userId, ctx),
        ...metricTools(env, userId, ctx),
        ...focusViewTools(env, userId, ctx),
        ...helpTools(),
    });
}

/** Drop regex `pattern`s (and `$schema`) from a JSON schema, recursively. */
export function dropPatterns(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(dropPatterns);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(
        Object.entries(node).filter(([key]) => key !== "pattern" && key !== "$schema").map(([key, value]) => [key, dropPatterns(value)]),
    );
}

/** Validation-only bounds the model can't act on; batch caps are already stated in each description. */
const BOUNDS = new Set(["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"]);

/**
 * Shrink a JSON schema for the model (validation still runs on the full zod schema): drop
 * {@link BOUNDS}, fold `anyOf: [X, null]` into `type: [X, "null"]` and a union of same-type
 * literals into an `enum`. `$ref`/`$defs` are left alone: providers handle them inconsistently.
 */
export function slimSchema(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(slimSchema);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(node)) {
        if (BOUNDS.has(key)) continue;
        // `properties` maps field names to schemas: recurse per field, never filter the names.
        out[key] = key === "properties" && value && typeof value === "object"
            ? Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, slimSchema(schema)]))
            : slimSchema(value);
    }
    const { anyOf, ...rest } = out;
    if (!Array.isArray(anyOf) || anyOf.length < 2) return out;
    const literals = anyOf.every((b) => b && "const" in b && typeof b.type === "string" && b.type === anyOf[0].type && Object.keys(b).length === 2);
    if (literals) return { ...rest, type: anyOf[0].type, enum: anyOf.map((b) => b.const) };
    const nonNull = anyOf.filter((b) => b?.type !== "null");
    const [only] = nonNull;
    if (nonNull.length === 1 && typeof only.type === "string" && !("enum" in only) && !("const" in only)) {
        return { ...only, ...rest, type: [only.type, "null"] };
    }
    return { ...rest, anyOf };
}

/**
 * The model sees each input schema without the long regex `pattern`s that zod
 * emits for dates and uuids (`format` already says "date"/"uuid"), which were
 * most of the tool tokens, and slimmed further by {@link slimSchema}. Calls are
 * still validated against the full zod schema.
 */
function withoutPatterns<T extends Record<string, { inputSchema: unknown }>>(tools: T): T {
    for (const t of Object.values(tools)) {
        const full = asSchema(t.inputSchema as Parameters<typeof asSchema>[0]);
        t.inputSchema = jsonSchema(async () => slimSchema(dropPatterns(await full.jsonSchema)) as never, {
            validate: (value) => full.validate!(value),
        });
    }
    return tools;
}
