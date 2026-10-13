import { getRateLimitRedis } from "./redis";
import type { Env } from "../types/env";

/**
 * Per-person daily counter for optional, cost-bearing extras (a suggestion, a memory save over MCP).
 * True while the person is under `limit`, counting this call. A day is the UTC day: the budget is
 * cost control, not a promise about "today".
 *
 * Fails CLOSED on a Redis error: these extras are never worth unbounded spend, and refusing one
 * costs the person only a missing suggestion. No Redis configured (dev, tests) means no cap.
 * `userHash` is `hashIdentifier(userId)`, so no raw id reaches Upstash.
 */
export async function withinDailyBudget(env: Env, bucket: string, userHash: string, limit: number, now: Date = new Date()): Promise<boolean> {
    const redis = getRateLimitRedis(env);
    if (!redis) return true;
    try {
        const key = `budget:${bucket}:${userHash}:${now.toISOString().slice(0, 10)}`; // time-ok: a cost-control bucket named by the UTC date
        const used = await redis.incr(key);
        if (used === 1) await redis.expire(key, 26 * 60 * 60);
        return used <= limit;
    } catch {
        return false;
    }
}
