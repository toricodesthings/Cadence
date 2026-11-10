import { getRateLimitRedis } from "./redis";
import type { Env } from "../types/env";
import { logger } from "./log";

/**
 * Per-person daily counter for optional, cost-bearing extras (a suggestion, a memory save over MCP).
 * True while the person is under `limit`, counting this call. A day is the UTC day: the budget is
 * cost control, not a promise about "today".
 *
 * Fails CLOSED on a Redis error (unless `failOpen`, for a person's own work that costs nothing to keep): these extras
 * are never worth unbounded spend, and refusing one costs the person only a missing suggestion. No Redis configured (dev, tests) means no cap.
 * `userHash` is `hashIdentifier(userId)`, so no raw id reaches Upstash.
 */
export async function withinDailyBudget(env: Env, bucket: string, userHash: string, limit: number, now: Date = new Date(), { failOpen = false }: { failOpen?: boolean } = {}): Promise<boolean> {
    const redis = getRateLimitRedis(env);
    if (!redis) return true;
    try {
        const key = `budget:${bucket}:${userHash}:${now.toISOString().slice(0, 10)}`; // time-ok: a cost-control bucket named by the UTC date
        const used = await redis.incr(key);
        if (used === 1) await redis.expire(key, 26 * 60 * 60);
        return used <= limit;
    } catch {
        return failOpen;
    }
}

/** Default global ceiling on assistant spend per UTC day, in USD (`AI_DAILY_SPEND_CAP_USD`). */
export const DEFAULT_DAILY_SPEND_CAP_USD = 10;

const spendKey = (now: Date) => `budget:ai-spend:${now.toISOString().slice(0, 10)}`; // time-ok: a cost-control bucket named by the UTC date

export function dailySpendCap(env: Env): number {
    const cap = Number(env.AI_DAILY_SPEND_CAP_USD?.trim() || NaN);
    return Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_SPEND_CAP_USD;
}

/** Seconds until the next UTC midnight, when the spend ceiling resets. */
export function secondsToUtcMidnight(now: Date = new Date()): number {
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * Adds one OpenRouter charge to everyone's spend today. Never throws: a missed count is covered by
 * the hard credit limit on the OpenRouter key. The first charge past the cap logs `ai_spend_cap_reached` once a day.
 */
export async function addDailySpend(env: Env, usd: number | undefined, now: Date = new Date()): Promise<void> {
    if (!usd || !(usd > 0)) return;
    const redis = getRateLimitRedis(env);
    if (!redis) return;
    try {
        const key = spendKey(now);
        const total = Number(await redis.incrbyfloat(key, usd));
        if (total === usd) await redis.expire(key, 26 * 60 * 60);
        const cap = dailySpendCap(env);
        if (total >= cap && (await redis.set(`${key}:reached`, "1", { nx: true, ex: 26 * 60 * 60 }))) {
            logger.error("ai", "ai_spend_cap_reached", { capUsd: cap, spentUsd: Math.round(total * 100) / 100 });
        }
    } catch {
        // best effort
    }
}

/** True while today's assistant spend is under the cap. Fails OPEN: the OpenRouter credit limit is the hard stop, and a Redis blip must not stop the assistant for everyone. */
export async function spendWithinCap(env: Env, now: Date = new Date()): Promise<boolean> {
    const redis = getRateLimitRedis(env);
    if (!redis) return true;
    try {
        return Number((await redis.get(spendKey(now))) ?? 0) < dailySpendCap(env);
    } catch {
        return true;
    }
}
