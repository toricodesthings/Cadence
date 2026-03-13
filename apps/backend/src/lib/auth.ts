import { createMiddleware } from "hono/factory";
import type { Env } from "../types/env";
import { AppError, createErrorBody } from "./errors";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getRequestId, setRequestErrorCode } from "./request-log";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedUrl = "";

export type AuthVariables = {
    userId: string;
    userEmail?: string;
    requestId: string;
    requestStartedAt: number;
    errorCode?: string;
};

function parseCsvList(value?: string | null) {
    if (!value) return [];
    return value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

export function isAdminUser(env: Env, identity: { userId: string; email?: string | null }) {
    const allowedUserIds = parseCsvList(env.ADMIN_USER_IDS);
    if (allowedUserIds.includes(identity.userId.toLowerCase())) {
        return true;
    }

    const normalizedEmail = identity.email?.trim().toLowerCase();
    if (!normalizedEmail) {
        return false;
    }

    const allowedEmails = parseCsvList(env.ADMIN_EMAILS);
    return allowedEmails.includes(normalizedEmail);
}

function classifyAuthFailure(error: unknown) {
    const message = error instanceof Error ? error.message : "Invalid token";

    if (message.toLowerCase().includes("exp")) {
        return new AppError(401, "TOKEN_EXPIRED", "Session expired");
    }

    if (message.toLowerCase().includes("fetch") || message.toLowerCase().includes("network")) {
        return new AppError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication provider unavailable", true);
    }

    return new AppError(401, "UNAUTHORIZED", "Invalid token");
}

export const authMiddleware = createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables;
}>(async (c, next) => {
    const header = c.req.header("Authorization");
    if (!header?.startsWith("Bearer ")) {
        setRequestErrorCode(c, "UNAUTHORIZED");
        return c.json(
            createErrorBody({
                code: "UNAUTHORIZED",
                message: "Missing token",
                status: 401,
                isRetryable: false,
                requestId: getRequestId(c),
            }),
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
        if (typeof payload.email === "string") {
            c.set("userEmail", payload.email);
        }

        // Only sync user on write operations — GETs don't need to upsert
        const isWrite = c.req.method !== "GET" && c.req.method !== "HEAD";
        if (isWrite) {
            c.executionCtx.waitUntil(
                (async () => {
                    try {
                        const { getDbClient } = await import("./db");
                        const { withRls } = await import("./rls");
                        const { users } = await import("../db/schema");
                        const db = getDbClient(c.env as any);
                        await withRls(db as any, payload!.sub!, async (tx) => {
                            await tx.insert(users).values({ id: payload!.sub! }).onConflictDoNothing();
                        });
                    } catch (dbErr) {
                        console.error("Failed to sync user via background Worker:", dbErr);
                    }
                })()
            );
        }
    } catch (e: any) {
        if (e instanceof AppError) {
            setRequestErrorCode(c, e.code);
            return c.json(
                createErrorBody({
                    code: e.code,
                    message: e.message,
                    status: e.statusCode,
                    isRetryable: e.isRetryable,
                    requestId: getRequestId(c),
                }),
                e.statusCode as any,
            );
        }
        const authError = classifyAuthFailure(e);
        setRequestErrorCode(c, authError.code);
        return c.json(
            createErrorBody({
                code: authError.code,
                message: authError.message,
                status: authError.statusCode,
                isRetryable: authError.isRetryable,
                requestId: getRequestId(c),
            }),
            authError.statusCode as any,
        );
    }

    await next();
});
