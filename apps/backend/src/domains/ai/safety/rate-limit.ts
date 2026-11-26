import type { Redis } from "@upstash/redis/cloudflare";
import { CHAT_IMAGE_LIMITS, type AiImageUsage, type AiUsage } from "@cadence/contracts/ai";
import { getDeploymentStage, type Env } from "../../../types/env";
import { MAX_OUTPUT_TOKENS } from "./input-guard";
import {
    rlKeys,
    WINDOW_5H_S,
    WINDOW_7D_S,
    WINDOW_24H_S,
    INFLIGHT_TTL_S,
    type Window,
    type Dimension,
} from "./rate-limit-keys";

const HISTORY_TOOL_BUDGET = 3_000;
const TOKENS_PER_IMAGE = 1_600;

const ADMIT_SCRIPT = `
-- @cadence:ai:rl:admit:v2
local r5 = tonumber(redis.call('GET', KEYS[1]) or '0')
local r7 = tonumber(redis.call('GET', KEYS[2]) or '0')
local t5 = tonumber(redis.call('GET', KEYS[3]) or '0')
local t7 = tonumber(redis.call('GET', KEYS[4]) or '0')
local inf = tonumber(redis.call('GET', KEYS[5]) or '0')
local i = tonumber(redis.call('GET', KEYS[6]) or '0')
local reserve = tonumber(ARGV[1])
local lr5, lt5, lr7, lt7, lc = tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local w5, w7, infttl = tonumber(ARGV[7]), tonumber(ARGV[8]), tonumber(ARGV[9])
local n, li, w24 = tonumber(ARGV[10]), tonumber(ARGV[11]), tonumber(ARGV[12])
local p5 = redis.call('PTTL', KEYS[1])
local p7 = redis.call('PTTL', KEYS[2])
local pi = redis.call('PTTL', KEYS[6])
-- Reject WITHOUT mutating: report current usage so the caller can surface remaining.
if inf + 1 > lc then return {0, 'concurrency', '5h', r5, t5, r7, t7, p5, p7, i, pi} end
if r5 + 1 > lr5 then return {0, 'req', '5h', r5, t5, r7, t7, p5, p7, i, pi} end
if t5 + reserve > lt5 then return {0, 'tok', '5h', r5, t5, r7, t7, p5, p7, i, pi} end
if r7 + 1 > lr7 then return {0, 'req', '7d', r5, t5, r7, t7, p5, p7, i, pi} end
if t7 + reserve > lt7 then return {0, 'tok', '7d', r5, t5, r7, t7, p5, p7, i, pi} end
if n > 0 and i + n > li then return {0, 'img', '24h', r5, t5, r7, t7, p5, p7, i, pi} end
-- Admit: increment requests, reserve tokens, bump inflight; anchor window TTLs (NX).
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], w5, 'NX')
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], w7, 'NX')
redis.call('INCRBY', KEYS[3], reserve); redis.call('EXPIRE', KEYS[3], w5, 'NX')
redis.call('INCRBY', KEYS[4], reserve); redis.call('EXPIRE', KEYS[4], w7, 'NX')
redis.call('INCR', KEYS[5]); redis.call('EXPIRE', KEYS[5], infttl)
if n > 0 then
    redis.call('INCRBY', KEYS[6], n); redis.call('EXPIRE', KEYS[6], w24, 'NX')
    i = i + n
    pi = redis.call('PTTL', KEYS[6])
end
p5 = redis.call('PTTL', KEYS[1]); p7 = redis.call('PTTL', KEYS[2])
return {1, '', '', r5 + 1, t5 + reserve, r7 + 1, t7 + reserve, p5, p7, i, pi}
`;

const SETTLE_SCRIPT = `
-- @cadence:ai:rl:settle:v1
local delta = tonumber(ARGV[1])
redis.call('INCRBY', KEYS[1], delta)
redis.call('INCRBY', KEYS[2], delta)
local inf = redis.call('DECR', KEYS[3])
if inf < 0 then redis.call('SET', KEYS[3], '0') end
return 1
`;

export interface AiLimits {
    requests5h: number;
    tokens5h: number;
    requests7d: number;
    tokens7d: number;
    maxConcurrent: number;
    reserve: number;
    images24h: number;
    imagesPerMessage: number;
    imagesMaxPending: number;
    failClosed: boolean;
}

export interface RemainingByWindow {
    req5h: number;
    tok5h: number;
    reset5hEpoch: number;
    req7d: number;
    tok7d: number;
    reset7dEpoch: number;
    img24h: number;
    reset24hEpoch: number;
}

export type AdmitResult =
    | { ok: true; reserved: number; remaining: RemainingByWindow }
    | {
          ok: false;
          code: "AI_RATE_LIMITED" | "AI_IMAGE_LIMITED";
          window: Window;
          dimension: Dimension | "concurrency";
          retryAfterS: number;
          remaining: RemainingByWindow;
      };

function num(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function ttlSec(pttlMs: number, fallbackS: number): number {
    return pttlMs > 0 ? Math.ceil(pttlMs / 1000) : fallbackS;
}

export function intEnv(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt((raw ?? "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveLimits(env: Env): AiLimits {
    const failMode = env.AI_RATE_LIMIT_FAIL_MODE?.trim().toLowerCase();
    return {
        requests5h: intEnv(env.AI_RL_REQUESTS_5H, 150),
        tokens5h: intEnv(env.AI_RL_TOKENS_5H, 750_000),
        requests7d: intEnv(env.AI_RL_REQUESTS_7D, 1_500),
        tokens7d: intEnv(env.AI_RL_TOKENS_7D, 6_000_000),
        maxConcurrent: intEnv(env.AI_RL_MAX_CONCURRENT, 3),
        reserve: intEnv(env.AI_RL_RESERVE_TOKENS, 6_000),
        images24h: intEnv(env.AI_RL_IMAGES_24H, 40),
        imagesPerMessage: intEnv(env.AI_IMAGES_PER_MESSAGE, CHAT_IMAGE_LIMITS.perMessage),
        imagesMaxPending: intEnv(env.AI_IMAGES_MAX_PENDING, 8),
        failClosed: failMode ? failMode === "closed" : getDeploymentStage(env) === "production",
    };
}

export function estimateReserve(incomingChars: number, limits: AiLimits, imageCount = 0): number {
    const inputEst = Math.ceil(Math.max(0, incomingChars) / 4) + TOKENS_PER_IMAGE * Math.max(0, imageCount);
    return Math.max(limits.reserve, inputEst + MAX_OUTPUT_TOKENS + HISTORY_TOOL_BUDGET);
}

export const CACHE_READ_WEIGHT = 0.1;
export const CACHE_WRITE_WEIGHT = 1.25;

export function meterUsage(usage: unknown): number {
    const u = usage as
        | {
              totalTokens?: unknown;
              inputTokens?: unknown;
              outputTokens?: unknown;
              inputTokenDetails?: { cacheReadTokens?: unknown; cacheWriteTokens?: unknown };
          }
        | null
        | undefined;
    if (!u || typeof u !== "object") return 0;
    const count = (n: unknown) => (typeof n === "number" && n > 0 ? n : 0);
    const input = count(u.inputTokens);
    const output = count(u.outputTokens);
    const read = Math.min(count(u.inputTokenDetails?.cacheReadTokens), input);
    const write = Math.min(count(u.inputTokenDetails?.cacheWriteTokens), input - read);
    if (read + write > 0) {
        return Math.ceil(input - read - write + read * CACHE_READ_WEIGHT + write * CACHE_WRITE_WEIGHT + output);
    }
    if (typeof u.totalTokens === "number" && u.totalTokens >= 0) return u.totalTokens;
    return input + output;
}

export function readMeteredTokens(responseMessage: unknown): number {
    return meterUsage((responseMessage as { metadata?: { totalUsage?: unknown } } | null)?.metadata?.totalUsage);
}

export type TurnSpend = { costUsd?: number; servedModel?: string };

export function addStepSpend(
    spend: TurnSpend,
    step: { providerMetadata?: unknown; response?: { modelId?: string } },
): TurnSpend {
    const cost = (step.providerMetadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter
        ?.usage?.cost;
    return {
        costUsd: typeof cost === "number" ? (spend.costUsd ?? 0) + cost : spend.costUsd,
        servedModel: step.response?.modelId ?? spend.servedModel,
    };
}

function buildRemaining(
    vals: {
        req5h: number;
        tok5h: number;
        req7d: number;
        tok7d: number;
        pttl5h: number;
        pttl7d: number;
        img24h: number;
        pttl24h: number;
    },
    limits: AiLimits,
): RemainingByWindow {
    const nowSec = Math.floor(Date.now() / 1000);
    return {
        req5h: Math.max(0, limits.requests5h - vals.req5h),
        tok5h: Math.max(0, limits.tokens5h - vals.tok5h),
        reset5hEpoch: nowSec + ttlSec(vals.pttl5h, WINDOW_5H_S),
        req7d: Math.max(0, limits.requests7d - vals.req7d),
        tok7d: Math.max(0, limits.tokens7d - vals.tok7d),
        reset7dEpoch: nowSec + ttlSec(vals.pttl7d, WINDOW_7D_S),
        img24h: Math.max(0, limits.images24h - vals.img24h),
        reset24hEpoch: nowSec + ttlSec(vals.pttl24h, WINDOW_24H_S),
    };
}

export async function admit(
    redis: Redis,
    userKey: string,
    reserve: number,
    limits: AiLimits,
    imageCount = 0,
): Promise<AdmitResult> {
    const k = rlKeys(userKey);
    const out = (await redis.eval(
        ADMIT_SCRIPT,
        [k.req5h, k.req7d, k.tok5h, k.tok7d, k.inflight, k.img24h],
        [
            String(reserve),
            String(limits.requests5h),
            String(limits.tokens5h),
            String(limits.requests7d),
            String(limits.tokens7d),
            String(limits.maxConcurrent),
            String(WINDOW_5H_S),
            String(WINDOW_7D_S),
            String(INFLIGHT_TTL_S),
            String(imageCount),
            String(limits.images24h),
            String(WINDOW_24H_S),
        ],
    )) as unknown[];

    const admitted = num(out[0]) === 1;
    const dimension = String(out[1] ?? "") as Dimension | "concurrency" | "";
    const window = String(out[2] ?? "") as Window | "";
    const req5h = num(out[3]);
    const tok5h = num(out[4]);
    const req7d = num(out[5]);
    const tok7d = num(out[6]);
    const pttl5h = num(out[7]);
    const pttl7d = num(out[8]);
    const img24h = num(out[9]);
    const pttl24h = num(out[10]);

    const remaining = buildRemaining({ req5h, tok5h, req7d, tok7d, pttl5h, pttl7d, img24h, pttl24h }, limits);
    if (admitted) return { ok: true, reserved: reserve, remaining };

    const breachWindow = (window || "5h") as Window;
    const retryAfterS =
        dimension === "concurrency"
            ? 5
            : breachWindow === "24h"
              ? ttlSec(pttl24h, WINDOW_24H_S)
              : ttlSec(breachWindow === "5h" ? pttl5h : pttl7d, breachWindow === "5h" ? WINDOW_5H_S : WINDOW_7D_S);
    return {
        ok: false,
        code: dimension === "img" ? "AI_IMAGE_LIMITED" : "AI_RATE_LIMITED",
        window: breachWindow,
        dimension: (dimension || "req") as Dimension | "concurrency",
        retryAfterS,
        remaining,
    };
}

export async function settle(redis: Redis, userKey: string, reserved: number, actualTokens: number): Promise<void> {
    const k = rlKeys(userKey);
    const delta = Math.max(0, actualTokens) - reserved;
    await redis.eval(SETTLE_SCRIPT, [k.tok5h, k.tok7d, k.inflight], [String(delta)]);
}

export function rateLimitHeaders(remaining: RemainingByWindow, limits: AiLimits): Record<string, string> {
    return {
        "X-RateLimit-Limit-Requests-5h": String(limits.requests5h),
        "X-RateLimit-Remaining-Requests-5h": String(remaining.req5h),
        "X-RateLimit-Limit-Tokens-5h": String(limits.tokens5h),
        "X-RateLimit-Remaining-Tokens-5h": String(remaining.tok5h),
        "X-RateLimit-Reset-5h": String(remaining.reset5hEpoch),
        "X-RateLimit-Limit-Requests-7d": String(limits.requests7d),
        "X-RateLimit-Remaining-Requests-7d": String(remaining.req7d),
        "X-RateLimit-Limit-Tokens-7d": String(limits.tokens7d),
        "X-RateLimit-Remaining-Tokens-7d": String(remaining.tok7d),
        "X-RateLimit-Reset-7d": String(remaining.reset7dEpoch),
        "X-RateLimit-Limit-Images-24h": String(limits.images24h),
        "X-RateLimit-Remaining-Images-24h": String(remaining.img24h),
        "X-RateLimit-Reset-Images-24h": String(remaining.reset24hEpoch),
    };
}

export function emptyUsage(limits: AiLimits): AiUsage {
    return {
        enabled: false,
        windows: {
            "5h": {
                requests: { used: 0, limit: limits.requests5h },
                tokens: { used: 0, limit: limits.tokens5h },
                resetEpoch: null,
            },
            "7d": {
                requests: { used: 0, limit: limits.requests7d },
                tokens: { used: 0, limit: limits.tokens7d },
                resetEpoch: null,
            },
        },
        images: { used: 0, limit: limits.images24h, perMessage: limits.imagesPerMessage, resetEpoch: null },
    };
}

function resetEpoch(pttlMs: number): number | null {
    return pttlMs > 0 ? Math.floor(Date.now() / 1000) + Math.ceil(pttlMs / 1000) : null;
}

export async function readImageUsage(redis: Redis, userKey: string, limits: AiLimits): Promise<AiImageUsage> {
    const k = rlKeys(userKey);
    const res = (await redis.pipeline().get(k.img24h).pttl(k.img24h).exec()) as unknown[];
    return {
        used: num(res[0]),
        limit: limits.images24h,
        perMessage: limits.imagesPerMessage,
        resetEpoch: resetEpoch(num(res[1])),
    };
}

export async function readUsage(redis: Redis, userKey: string, limits: AiLimits): Promise<AiUsage> {
    const k = rlKeys(userKey);
    const res = (await redis
        .pipeline()
        .get(k.req5h)
        .get(k.tok5h)
        .get(k.req7d)
        .get(k.tok7d)
        .pttl(k.req5h)
        .pttl(k.req7d)
        .get(k.img24h)
        .pttl(k.img24h)
        .exec()) as unknown[];

    const pttl5h = num(res[4]);
    const pttl7d = num(res[5]);
    return {
        enabled: true,
        windows: {
            "5h": {
                requests: { used: num(res[0]), limit: limits.requests5h },
                tokens: { used: num(res[1]), limit: limits.tokens5h },
                resetEpoch: resetEpoch(pttl5h),
            },
            "7d": {
                requests: { used: num(res[2]), limit: limits.requests7d },
                tokens: { used: num(res[3]), limit: limits.tokens7d },
                resetEpoch: resetEpoch(pttl7d),
            },
        },
        images: {
            used: num(res[6]),
            limit: limits.images24h,
            perMessage: limits.imagesPerMessage,
            resetEpoch: resetEpoch(num(res[7])),
        },
    };
}
