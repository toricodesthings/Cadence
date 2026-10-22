import type { Context } from "hono";
import type { Redis } from "@upstash/redis/cloudflare";
import { AI_ERROR_CODES } from "@cadence/contracts/ai";
import { getRequestId, setRequestErrorCode } from "../../../platform/request-log";
import { logger } from "../../../platform/log";
import { AI_ERROR_MESSAGES } from "./stream-error";
import { admit, rateLimitHeaders, type AiLimits, type RemainingByWindow } from "./rate-limit";
import type { Env } from "../../../types/env";
import type { AuthVariables } from "../../../platform/auth";

type AiContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

/**
 * Pre-stream 429 for the AI usage budget. The HTTP status is still unsent here, so
 * we use the normal JSON `AppError` envelope (reusing the `AI_RATE_LIMITED` spec the
 * frontend already renders with a Retry affordance) and attach `Retry-After` +
 * `X-RateLimit-*` headers — mirroring the global `rateLimitResponse` in index.ts.
 */
export function aiRateLimitResponse(
    c: AiContext,
    opts: {
        retryAfterS: number;
        limits: AiLimits;
        remaining?: RemainingByWindow;
        code?: "AI_RATE_LIMITED" | "AI_IMAGE_LIMITED";
    },
) {
    const code = opts.code ?? "AI_RATE_LIMITED";
    setRequestErrorCode(c, code);
    const headers: Record<string, string> = { "Retry-After": String(Math.max(1, opts.retryAfterS)) };
    if (opts.remaining) Object.assign(headers, rateLimitHeaders(opts.remaining, opts.limits));
    return c.json(
        {
            error: {
                code,
                message: AI_ERROR_MESSAGES[code],
                status: 429,
                isRetryable: AI_ERROR_CODES[code].isRetryable,
                requestId: getRequestId(c),
            },
        },
        { status: 429, headers },
    );
}

/**
 * Admits a chat turn against the usage budget: `rejected` is the 429 to return;
 * otherwise `admitted` says whether a reserve was taken (only those are settled) and
 * `headers` echo the remaining budget on the success response.
 */
export async function admitChatTurn(
    c: AiContext,
    rlRedis: Redis,
    turn: { userKey: string; userHash: string; reserved: number; limits: AiLimits; newImages: number },
): Promise<{ rejected?: ReturnType<typeof aiRateLimitResponse>; admitted: boolean; headers?: Record<string, string> }> {
    const { userKey, userHash, reserved, limits, newImages } = turn;
    const requestId = getRequestId(c);
    try {
        const admission = await admit(rlRedis, userKey, reserved, limits, newImages);
        if (!admission.ok) {
            logger.warn("ai", "ai_ratelimit_rejected", {
                requestId,
                userHash,
                window: admission.window,
                dimension: admission.dimension,
                retryAfterS: admission.retryAfterS,
            });
            return {
                admitted: false,
                rejected: aiRateLimitResponse(c, {
                    code: admission.code,
                    retryAfterS: admission.retryAfterS,
                    limits,
                    remaining: admission.remaining,
                }),
            };
        }
        return { admitted: true, headers: rateLimitHeaders(admission.remaining, limits) };
    } catch {
        // Redis unreachable → fail-open (default) or fail-closed per policy. Even
        // fail-open keeps per-turn caps + the 60s CF limiter as backstops (§9.5).
        logger.warn("ai", "ai_ratelimit_unavailable", { requestId, userHash, op: "admit" });
        if (limits.failClosed) return { admitted: false, rejected: aiRateLimitResponse(c, { retryAfterS: 30, limits }) };
        // Fail-open must not mean unmetered: a tight per-person limiter stands in while the budget is blind.
        if (c.env.RATE_LIMITER_AI && !(await c.env.RATE_LIMITER_AI.limit({ key: c.get("userId") })).success) {
            return { admitted: false, rejected: aiRateLimitResponse(c, { retryAfterS: 30, limits }) };
        }
        return { admitted: false };
    }
}
