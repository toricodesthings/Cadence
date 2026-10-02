import type { MiddlewareHandler } from "hono";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { logger, issuesFromError } from "../../platform/log";

/** Public holiday data only; JWT/rate-limit middleware still runs before this. */
export const holidayCache: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
    if (c.req.method !== "GET") return next();
    const cache = typeof caches === "undefined" ? undefined : await caches.open("cadence-holidays").catch((error: unknown) => {
        logger.warn("proxy", "holiday_cache_read_failed", { issues: issuesFromError(error) });
        return undefined;
    });
    if (!cache) return next();

    const url = new URL(c.req.url);
    url.pathname = `/__holiday_cache/v1${url.pathname}`;
    url.searchParams.sort();
    // No bearer token, cookies, CORS or user identity in the stored object.
    const key = new Request(url, { method: "GET" });
    try {
        const hit = await cache.match(key);
        if (hit) {
            c.res = hit;
            return;
        }
    } catch (error) {
        logger.warn("proxy", "holiday_cache_read_failed", { issues: issuesFromError(error) });
    }

    await next();
    const cacheControl = c.res.headers.get("Cache-Control") ?? "";
    if (c.res.status !== 200 || !cacheControl.startsWith("public,")) return;

    const stored = new Response(c.res.clone().body, {
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": cacheControl,
        },
    });
    c.executionCtx.waitUntil(cache.put(key, stored).catch((error: unknown) => {
        logger.warn("proxy", "holiday_cache_write_failed", { issues: issuesFromError(error) });
    }));
};
