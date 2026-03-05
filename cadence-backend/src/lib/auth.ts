import { createMiddleware } from "hono/factory";
import type { Env } from "../types/env";
import { AppError } from "./errors";
import { createRemoteJWKSet, jwtVerify } from "jose";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedUrl = "";

export type AuthVariables = { userId: string };

export const authMiddleware = createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables;
}>(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
        return c.json(
            { error: { code: "UNAUTHORIZED", message: "Missing token" } },
            401,
        );
    }

    const token = header.slice(7);
    const jwksUrl = c.env.NEON_AUTH_JWKS_URL;

    try {
        if (!jwksUrl) {
            throw new AppError(500, "INTERNAL_SERVER_ERROR", "Missing NEON_AUTH_JWKS_URL");
        }

        if (!jwksCache || cachedUrl !== jwksUrl) {
            jwksCache = createRemoteJWKSet(new URL(jwksUrl), {
                cooldownDuration: 30000, // wait 30s before trying to fetch again if cached
                timeoutDuration: 5000,
            });
            cachedUrl = jwksUrl;
        }

        let payload;
        let attempt = 0;
        const maxRetries = 3;

        while (attempt < maxRetries) {
            try {
                const result = await jwtVerify(token, jwksCache);
                payload = result.payload;
                break;
            } catch (err: any) {
                if (err.code === 'ERR_JOSE_GENERIC' || err.message?.includes('fetch') || err.message?.includes('network')) {
                    attempt++;
                    if (attempt >= maxRetries) throw err;
                    await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 100));
                } else {
                    throw err;
                }
            }
        }

        if (!payload?.sub) {
            throw new AppError(401, "UNAUTHORIZED", "Missing subject in token");
        }

        c.set("userId", payload.sub);

        // Only sync user on write operations — GETs don't need to upsert
        const isWrite = c.req.method !== "GET" && c.req.method !== "HEAD";
        if (isWrite) {
            c.executionCtx.waitUntil(
                (async () => {
                    try {
                        const { getDbClient } = await import("./db");
                        const { users } = await import("../db/schema");
                        const db = getDbClient(c.env as any);
                        await db.insert(users).values({ id: payload!.sub! }).onConflictDoNothing();
                    } catch (dbErr) {
                        console.error("Failed to sync user via background Worker:", dbErr);
                    }
                })()
            );
        }
    } catch (e: any) {
        console.error("JWT Verification failed:", e);
        if (e instanceof AppError) {
            return c.json({ error: { code: e.code, message: e.message } }, e.statusCode as any);
        }
        // E.g., token expired, signature invalid, etc.
        return c.json({ error: { code: "UNAUTHORIZED", message: e.message || "Invalid token", stack: e.stack } }, 401);
    }

    await next();
});
