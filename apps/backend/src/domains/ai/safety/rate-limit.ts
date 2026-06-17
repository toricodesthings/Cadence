/**
 * AI usage budget — admission + settlement for the cost-bearing chat turn
 * (docs/Update 4/06-16-2026_ai-rate-limiting-and-abuse-protection-plan.md).
 *
 * The requirement: bound abuse + token drainage on TWO rolling windows (5h and
 * 1 week), each metered on TWO dimensions (requests AND tokens). This is an
 * always-on guardrail (no enable flag): it is enforced whenever Upstash is
 * reachable, layered ON TOP of the existing per-turn caps (`input-guard.ts`) and
 * the Cloudflare short-window limiters — never replacing them.
 *
 * The crux is that a turn's token cost is unknown until the model reports
 * `totalUsage` in `onFinish`. So we RESERVE a conservative estimate at admission,
 * then RECONCILE to the actual at settlement (a possibly-negative `INCRBY`).
 *
 *   admit()  — one pipeline: increment requests + reserve tokens in all four
 *              counters + bump the concurrency counter, then evaluate the caps.
 *              On any breach, one compensating pipeline rolls the attempt back so
 *              a rejected turn is budget-neutral (no orphaned spend).
 *   settle() — idempotent per streamId: true-up the token counters to actual and
 *              release the concurrency slot. Runs in onFinish (even on disconnect).
 *   readUsage() — cheap read for GET /ai/usage transparency ("messages left…").
 *
 * Every mutating op is a SINGLE pipelined round-trip (§15.3), on the same Upstash
 * REST client the resumption path already uses.
 */
import type { Redis } from "@upstash/redis/cloudflare";
import type { AiUsage } from "@cadence/contracts/ai";
import type { Env } from "../../../types/env";
import { MAX_OUTPUT_TOKENS } from "./input-guard";
import {
    rlKeys,
    WINDOW_5H_S,
    WINDOW_7D_S,
    INFLIGHT_TTL_S,
    type Window,
    type Dimension,
} from "./rate-limit-keys";

/** Flat token allowance folded into the reserve for history + tool round-trips. */
const HISTORY_TOOL_BUDGET = 3_000;

// SECURITY NOTE: `redis.eval` runs Redis server-side Lua (NOT JavaScript eval). Both
// scripts below are STATIC module constants — no value is ever interpolated into the
// script body. All dynamic inputs (the user-scoped keys + limits/reserve) are passed
// as parameterized KEYS/ARGV, and a script can only touch the keys handed to it, so
// there is no injection surface and no cross-tenant reach (§15.1).

/**
 * ADMISSION — one atomic, single-billed `EVAL` (Upstash bills per command; a pipeline
 * of N commands is N commands and is **not atomic**, so we consolidate). It reads the
 * four budget counters + inflight, evaluates every cap, and mutates **only if it
 * admits** — so a rejected turn touches nothing (no rollback round-trip, no TOCTOU
 * window). EXPIRE … NX anchors each window's TTL at its first write.
 *
 *   KEYS = [req5h, req7d, tok5h, tok7d, inflight]
 *   ARGV = [reserve, lim_req5h, lim_tok5h, lim_req7d, lim_tok7d, lim_conc, w5_s, w7_s, inflight_ttl_s]
 *   ⇒    [admitted(0|1), dimension, window, used_req5h, used_tok5h, used_req7d, used_tok7d, pttl5h_ms, pttl7d_ms]
 */
const ADMIT_SCRIPT = `
-- @cadence:ai:rl:admit:v1
local r5 = tonumber(redis.call('GET', KEYS[1]) or '0')
local r7 = tonumber(redis.call('GET', KEYS[2]) or '0')
local t5 = tonumber(redis.call('GET', KEYS[3]) or '0')
local t7 = tonumber(redis.call('GET', KEYS[4]) or '0')
local inf = tonumber(redis.call('GET', KEYS[5]) or '0')
local reserve = tonumber(ARGV[1])
local lr5, lt5, lr7, lt7, lc = tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6])
local w5, w7, infttl = tonumber(ARGV[7]), tonumber(ARGV[8]), tonumber(ARGV[9])
local p5 = redis.call('PTTL', KEYS[1])
local p7 = redis.call('PTTL', KEYS[2])
-- Reject WITHOUT mutating: report current usage so the caller can surface remaining.
if inf + 1 > lc then return {0, 'concurrency', '5h', r5, t5, r7, t7, p5, p7} end
if r5 + 1 > lr5 then return {0, 'req', '5h', r5, t5, r7, t7, p5, p7} end
if t5 + reserve > lt5 then return {0, 'tok', '5h', r5, t5, r7, t7, p5, p7} end
if r7 + 1 > lr7 then return {0, 'req', '7d', r5, t5, r7, t7, p5, p7} end
if t7 + reserve > lt7 then return {0, 'tok', '7d', r5, t5, r7, t7, p5, p7} end
-- Admit: increment requests, reserve tokens, bump inflight; anchor window TTLs (NX).
redis.call('INCR', KEYS[1]); redis.call('EXPIRE', KEYS[1], w5, 'NX')
redis.call('INCR', KEYS[2]); redis.call('EXPIRE', KEYS[2], w7, 'NX')
redis.call('INCRBY', KEYS[3], reserve); redis.call('EXPIRE', KEYS[3], w5, 'NX')
redis.call('INCRBY', KEYS[4], reserve); redis.call('EXPIRE', KEYS[4], w7, 'NX')
redis.call('INCR', KEYS[5]); redis.call('EXPIRE', KEYS[5], infttl)
p5 = redis.call('PTTL', KEYS[1]); p7 = redis.call('PTTL', KEYS[2])
return {1, '', '', r5 + 1, t5 + reserve, r7 + 1, t7 + reserve, p5, p7}
`;

/**
 * SETTLEMENT — one atomic, single-billed `EVAL`. Reconciles the token reserve to the
 * actual delta (refund/top-up) and releases the concurrency slot, flooring inflight at
 * 0 so a stray double-release can never drive it negative. `onFinish` is the sole
 * settler (fires once per stream), so no idempotency marker is needed (§9.1).
 *
 *   KEYS = [tok5h, tok7d, inflight]   ARGV = [delta]   ⇒ 1
 */
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
    /** When Redis is unreachable: true → reject (429), false → admit (default). */
    failClosed: boolean;
}

/** Remaining headroom + reset epochs, surfaced as `X-RateLimit-*` on a 429. */
export interface RemainingByWindow {
    req5h: number;
    tok5h: number;
    reset5hEpoch: number;
    req7d: number;
    tok7d: number;
    reset7dEpoch: number;
}

export type AdmitResult =
    | { ok: true; reserved: number; remaining: RemainingByWindow }
    | {
          ok: false;
          code: "AI_RATE_LIMITED";
          window: Window;
          dimension: Dimension | "concurrency";
          retryAfterS: number;
          remaining: RemainingByWindow;
      };

/** Coerce a Redis reply (number, numeric string, or null) to a finite number. */
function num(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
}

/** PTTL (ms) → whole seconds, falling back to the full window when no TTL is set. */
function ttlSec(pttlMs: number, fallbackS: number): number {
    return pttlMs > 0 ? Math.ceil(pttlMs / 1000) : fallbackS;
}

/** Parse a positive integer env var, falling back to a default. */
function intEnv(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt((raw ?? "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Resolve limits from env with the §6 defaults (sized for `google/gemini-2.5-flash`
 * + a heavy-but-legitimate user). All are env-overridable so policy can be retuned
 * per model cost without a code deploy.
 */
export function resolveLimits(env: Env): AiLimits {
    return {
        requests5h: intEnv(env.AI_RL_REQUESTS_5H, 150),
        tokens5h: intEnv(env.AI_RL_TOKENS_5H, 750_000),
        requests7d: intEnv(env.AI_RL_REQUESTS_7D, 1_500),
        tokens7d: intEnv(env.AI_RL_TOKENS_7D, 6_000_000),
        maxConcurrent: intEnv(env.AI_RL_MAX_CONCURRENT, 3),
        reserve: intEnv(env.AI_RL_RESERVE_TOKENS, 6_000),
        failClosed: env.AI_RATE_LIMIT_FAIL_MODE?.trim().toLowerCase() === "closed",
    };
}

/**
 * A deliberately conservative per-turn token HOLD (not a billing figure —
 * settlement trues it up). It only needs to be ≥ a typical turn so a concurrent
 * burst can't systematically under-reserve. Floors at the env reserve.
 */
export function estimateReserve(incomingChars: number, limits: AiLimits): number {
    const inputEst = Math.ceil(Math.max(0, incomingChars) / 4);
    return Math.max(limits.reserve, inputEst + MAX_OUTPUT_TOKENS + HISTORY_TOOL_BUDGET);
}

/**
 * Read the actual total tokens the model reported. `messageMetadata` attaches
 * `{ totalUsage, model }` to the finish part (ai.route.ts), so it lands on
 * `responseMessage.metadata.totalUsage`. Falls back to input+output, then 0 (a
 * hard error/abort with no usage → 0 → settlement REFUNDS the reservation).
 */
export function readTotalTokens(responseMessage: unknown): number {
    const usage = (responseMessage as { metadata?: { totalUsage?: unknown } } | null)?.metadata?.totalUsage as
        | { totalTokens?: unknown; inputTokens?: unknown; outputTokens?: unknown }
        | undefined;
    if (!usage || typeof usage !== "object") return 0;
    if (typeof usage.totalTokens === "number" && usage.totalTokens >= 0) return usage.totalTokens;
    const input = typeof usage.inputTokens === "number" ? usage.inputTokens : 0;
    const output = typeof usage.outputTokens === "number" ? usage.outputTokens : 0;
    return Math.max(0, input + output);
}

function buildRemaining(
    vals: { req5h: number; tok5h: number; req7d: number; tok7d: number; pttl5h: number; pttl7d: number },
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
    };
}

/**
 * Admit (or reject) one turn in a SINGLE atomic, single-billed `EVAL` (§15.3). The
 * script checks every cap and mutates only when it admits, so a rejected turn is
 * inherently budget-neutral (nothing to roll back) and there is no check-then-set
 * race (Lua runs atomically server-side).
 */
export async function admit(
    redis: Redis,
    userKey: string,
    reserve: number,
    limits: AiLimits,
): Promise<AdmitResult> {
    const k = rlKeys(userKey);
    const out = (await redis.eval(
        ADMIT_SCRIPT,
        [k.req5h, k.req7d, k.tok5h, k.tok7d, k.inflight],
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

    const remaining = buildRemaining({ req5h, tok5h, req7d, tok7d, pttl5h, pttl7d }, limits);
    if (admitted) return { ok: true, reserved: reserve, remaining };

    const breachWindow = (window || "5h") as Window;
    const retryAfterS =
        dimension === "concurrency" ? 5 : ttlSec(breachWindow === "5h" ? pttl5h : pttl7d, breachWindow === "5h" ? WINDOW_5H_S : WINDOW_7D_S);
    return {
        ok: false,
        code: "AI_RATE_LIMITED",
        window: breachWindow,
        dimension: (dimension || "req") as Dimension | "concurrency",
        retryAfterS,
        remaining,
    };
}

/**
 * Reconcile the admission reserve to the ACTUAL token usage (refund or top-up) and
 * release the concurrency slot, in a SINGLE atomic, single-billed `EVAL`. A negative
 * delta (the common case — the reserve over-held) refunds the unused tokens. No
 * idempotency marker: `onFinish` is the sole settler and fires once per stream, and
 * the script floors inflight at 0 so even a stray double-release can't go negative.
 *
 * (Window TTLs are NOT re-armed here: a turn is capped at 45s ≪ the 5h/7d windows,
 * so a window can never roll over mid-turn and leave a TTL-less recreated key.)
 */
export async function settle(
    redis: Redis,
    userKey: string,
    reserved: number,
    actualTokens: number,
): Promise<void> {
    const k = rlKeys(userKey);
    const delta = Math.max(0, actualTokens) - reserved; // negative = refund the unused hold
    await redis.eval(SETTLE_SCRIPT, [k.tok5h, k.tok7d, k.inflight], [String(delta)]);
}

/**
 * Build the `X-RateLimit-*` response headers from a remaining snapshot (no
 * `Retry-After`). Returned on BOTH the success and 429 paths so the client can hold
 * its own budget view (the display "source of truth") and avoid polling GET /ai/usage
 * — the numbers are already in hand from `admit`, so this costs zero extra Redis.
 */
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
    };
}

/** A zero-usage budget snapshot (used when the budget is not configured/reachable). */
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
    };
}

/**
 * Read the caller's current budget usage in ONE pipeline (4×GET + 2×PTTL). Read-only
 * and scoped to the caller's own `userKey` — never reveals another tenant's numbers.
 */
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
        .exec()) as unknown[];

    const nowSec = Math.floor(Date.now() / 1000);
    const pttl5h = num(res[4]);
    const pttl7d = num(res[5]);
    return {
        enabled: true,
        windows: {
            "5h": {
                requests: { used: num(res[0]), limit: limits.requests5h },
                tokens: { used: num(res[1]), limit: limits.tokens5h },
                resetEpoch: pttl5h > 0 ? nowSec + Math.ceil(pttl5h / 1000) : null,
            },
            "7d": {
                requests: { used: num(res[2]), limit: limits.requests7d },
                tokens: { used: num(res[3]), limit: limits.tokens7d },
                resetEpoch: pttl7d > 0 ? nowSec + Math.ceil(pttl7d / 1000) : null,
            },
        },
    };
}
