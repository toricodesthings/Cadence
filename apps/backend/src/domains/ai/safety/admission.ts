import type { Context } from "hono";
import type { Redis } from "@upstash/redis/cloudflare";
import { AI_ERROR_CODES } from "@cadence/contracts/ai";
import { getRequestId, setRequestErrorCode } from "../../../platform/request-log";
import { logger } from "../../../platform/log";
import { AI_ERROR_MESSAGES } from "./stream-error";
import { admit, rateLimitHeaders, type AiLimits, type RemainingByWindow } from "./rate-limit";
import { getDeploymentStage, type Env } from "../../../types/env";
import { secondsToUtcMidnight, spendWithinCap } from "../../../platform/daily-budget";
import type { AuthVariables } from "../../../platform/auth";

type AiContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

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

function aiUnavailableResponse(c: AiContext, code: "AI_SPEND_CAPPED" | "AI_UPSTREAM_UNAVAILABLE", retryAfterS: number) {
    setRequestErrorCode(c, code);
    const { status, isRetryable } = AI_ERROR_CODES[code];
    return c.json(
        { error: { code, message: AI_ERROR_MESSAGES[code], status, isRetryable, requestId: getRequestId(c) } },
        { status, headers: { "Retry-After": String(Math.max(1, retryAfterS)) } },
    );
}

export async function admitChatTurn(
    c: AiContext,
    rlRedis: Redis | null,
    turn: { userKey: string; userHash: string; reserved: number; limits: AiLimits; newImages: number },
): Promise<{
    rejected?: ReturnType<typeof aiRateLimitResponse> | ReturnType<typeof aiUnavailableResponse>;
    admitted: boolean;
    headers?: Record<string, string>;
}> {
    const { userKey, userHash, reserved, limits, newImages } = turn;
    const requestId = getRequestId(c);
    if (!rlRedis) {
        if (getDeploymentStage(c.env) !== "production") return { admitted: false };
        logger.error("ai", "ai_ratelimit_unconfigured", { requestId });
        return { admitted: false, rejected: aiUnavailableResponse(c, "AI_UPSTREAM_UNAVAILABLE", 30) };
    }
    if (!(await spendWithinCap(c.env))) {
        return { admitted: false, rejected: aiUnavailableResponse(c, "AI_SPEND_CAPPED", secondsToUtcMidnight()) };
    }
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
        logger.warn("ai", "ai_ratelimit_unavailable", { requestId, userHash, op: "admit" });
        if (limits.failClosed)
            return { admitted: false, rejected: aiRateLimitResponse(c, { retryAfterS: 30, limits }) };
        if (c.env.RATE_LIMITER_AI && !(await c.env.RATE_LIMITER_AI.limit({ key: c.get("userId") })).success) {
            return { admitted: false, rejected: aiRateLimitResponse(c, { retryAfterS: 30, limits }) };
        }
        return { admitted: false };
    }
}
