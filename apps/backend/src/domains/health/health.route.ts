import { Hono } from "hono";
import type { Env } from "../../types/env";
import { getRedis } from "../../platform/redis";

export const healthRoutes = new Hono<{ Bindings: Env }>()
    .get("/", (c) => {
        return c.json({
            data: { status: "ok", timestamp: new Date().toISOString() },
        });
    })
    // Deploy-time connectivity smoke-check for Upstash (doc Update 4 §15.5). Kept
    // dark unless debug routes are explicitly enabled, so it never leaks config in
    // production. Reports `disabled` (resumption off / unconfigured), `ok`, or
    // `unavailable` (creds set but ping failed) — never echoes the url/token.
    .get("/redis", async (c) => {
        if (c.env.ENABLE_DEBUG_ROUTES?.trim().toLowerCase() !== "true") {
            return c.notFound();
        }
        const redis = getRedis(c.env);
        if (!redis) {
            return c.json({ data: { redis: "disabled" } });
        }
        try {
            await redis.ping();
            return c.json({ data: { redis: "ok" } });
        } catch {
            return c.json({ data: { redis: "unavailable" } }, 503);
        }
    });
