import { Hono } from "hono";
import type { Env } from "../../types/env";
import { getRedis } from "../../platform/redis";

export const healthRoutes = new Hono<{ Bindings: Env }>()
    .get("/", (c) => {
        const minDesktopVersion = c.env?.MIN_DESKTOP_VERSION?.trim() || null;
        return c.json({
            data: { status: "ok", timestamp: new Date().toISOString(), minDesktopVersion },
        });
    })
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
