import type { Env } from "../../../types/env";
import { logger, hashIdentifier } from "../../../platform/log";
import { taskTools } from "./tasks";
import { projectTools } from "./projects";
import { sectionTools } from "./sections";
import { tagTools } from "./tags";
import { habitTools } from "./habits";
import { inboxTools } from "./inbox";
import { suggestionTools } from "./suggestions";
import { calendarTools } from "./calendar";
import { metricTools } from "./metrics";

/**
 * Runtime context captured per request when the tool registry is built.
 * Carries the user's clock/locale so the model can resolve relative dates
 * ("tomorrow", "next Tuesday") into the ISO-8601 values tools expect.
 * `userId` is intentionally NOT part of this — it is passed separately to every
 * factory and is never a model-supplied argument (doc 05 §1, §5).
 */
export interface AgentContext {
    /** IANA timezone, e.g. "America/Toronto". */
    timezone: string;
    /** The user's current local clock time as an ISO-8601 string. */
    currentDate: string;
    /** First day of the week, e.g. "Sunday" | "Monday" — informs week windows. */
    weekStart?: string;
    /** BCP-47 locale, e.g. "en-CA". */
    locale?: string;
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
        return {
            ok: false,
            tool: toolName,
            error: `The "${toolName}" tool failed to run. Inform the user and offer to retry.`,
        };
    }
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
    return {
        ...taskTools(env, userId, ctx),
        ...projectTools(env, userId, ctx),
        ...sectionTools(env, userId, ctx),
        ...tagTools(env, userId, ctx),
        ...habitTools(env, userId, ctx),
        ...inboxTools(env, userId, ctx),
        ...suggestionTools(env, userId, ctx),
        ...calendarTools(env, userId, ctx),
        ...metricTools(env, userId, ctx),
    };
}
