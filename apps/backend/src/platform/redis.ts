import { Redis } from "@upstash/redis/cloudflare";
import { logger } from "./log";
import type { Env } from "../types/env";

function buildRedisClient(env: Env): Redis | null {
    const url = env.UPSTASH_REDIS_REST_URL?.trim();
    const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return null;
    if (!url.startsWith("https://")) {
        logger.error("ai", "redis_insecure_url", {});
        return null;
    }
    return new Redis({
        url,
        token,
        automaticDeserialization: false,
        enableAutoPipelining: true,
        retry: { retries: 2, backoff: (n) => 50 * 2 ** n },
    });
}

export function getRedis(env: Env): Redis | null {
    return buildRedisClient(env);
}

export function getRateLimitRedis(env: Env): Redis | null {
    return buildRedisClient(env);
}
