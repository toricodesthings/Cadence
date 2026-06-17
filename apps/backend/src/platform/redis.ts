/**
 * Upstash Redis (REST) client factory for AI stream resumption.
 *
 * Resumption is a *cache* concern: the DB is the source of truth, Redis only
 * holds the in-flight SSE chunk-log + abort flag (see
 * docs/Update 4/06-08-2026_ai-stream-resumption-and-abort-plan.md §5). The
 * client is constructed PER REQUEST (Workers best practice — never hold
 * request-derived state in a module global) and uses the official
 * `@upstash/redis/cloudflare` entrypoint: pure `fetch`/HTTP, no Node `net`/TCP,
 * so it runs on the Workers runtime with or without `nodejs_compat`.
 *
 * `getRedis` returning `null` is the single gate the AI routes check: when
 * resumption is unconfigured/disabled, every resumption path no-ops and
 * streaming behaves exactly as before (graceful degradation, §10).
 */
import { Redis } from "@upstash/redis/cloudflare";
import { logger } from "./log";
import type { Env } from "../types/env";

/**
 * Build a configured Upstash client from credentials alone, or null when they are
 * absent/insecure. Enforces HTTPS-only transport in code (§15.4) — a plaintext
 * endpoint is refused outright rather than streamed over the wire. Never logs the
 * url/token value, only the stable code.
 *
 * This is the shared constructor for both Redis-backed AI concerns; the per-feature
 * gating lives in the named accessors below.
 */
function buildRedisClient(env: Env): Redis | null {
    const url = env.UPSTASH_REDIS_REST_URL?.trim();
    const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return null;
    // Encrypted-transport guard (§15.4): refuse a non-TLS endpoint outright.
    if (!url.startsWith("https://")) {
        logger.error("ai", "redis_insecure_url", {});
        return null;
    }
    return new Redis({
        url,
        token,
        // We store/replay raw SSE strings; no JSON coercion on get/set.
        automaticDeserialization: false,
        // Coalesce same-tick commands into one HTTP request (§15.3). We also
        // build explicit pipelines for the hot paths so batching is deterministic.
        enableAutoPipelining: true,
        retry: { retries: 2, backoff: (n) => 50 * 2 ** n },
    });
}

/**
 * Returns a configured Upstash client for STREAM RESUMPTION, or null when that
 * feature is unconfigured/disabled. Gated behind `AI_STREAM_RESUME_ENABLED` so the
 * resumption paths no-op until rolled out.
 */
export function getRedis(env: Env): Redis | null {
    if (env.AI_STREAM_RESUME_ENABLED?.trim() !== "true") return null;
    return buildRedisClient(env);
}

/**
 * Returns a configured Upstash client for the AI USAGE BUDGET (rate limiting), or
 * null when Upstash is not configured. Deliberately NOT gated by a feature flag —
 * the budget is an always-on guardrail enforced whenever the store is reachable
 * (docs/Update 4/06-16-2026_ai-rate-limiting-and-abuse-protection-plan.md). When
 * Upstash is absent entirely, the route degrades to the existing per-turn caps +
 * Cloudflare short-window limiters (graceful degradation, never bricks chat).
 */
export function getRateLimitRedis(env: Env): Redis | null {
    return buildRedisClient(env);
}

/** True when resumable streams + hard abort are configured and enabled. */
export function isResumeEnabled(env: Env): boolean {
    return getRedis(env) !== null;
}
