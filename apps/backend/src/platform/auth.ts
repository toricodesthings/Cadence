import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env } from "../types/env";
import { getDeploymentStage } from "../types/env";
import { AppError, createErrorBody } from "./errors";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getRequestId, setRequestErrorCode } from "./request-log";
import { logger, hashIdentifier, issuesFromError } from "./log";
import { getDbClient } from "./db";
import { withRls } from "./rls";
import { users } from "../db/schema";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedUrl = "";

/** Maximum clock skew tolerance for JWT exp/nbf validation (seconds). */
const CLOCK_TOLERANCE_SECONDS = 30;

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
    const message = (error instanceof Error ? error.message : "Invalid token").toLowerCase();

    if (message.includes("exp")) {
        return new AppError(401, "TOKEN_EXPIRED", "Session expired");
    }

    if (message.includes("fetch") || message.includes("network")) {
        return new AppError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication provider unavailable", true);
    }

    if (message.includes("iss") || message.includes("issuer")) {
        return new AppError(401, "INVALID_ISSUER", "Token issuer not trusted");
    }

    if (message.includes("aud") || message.includes("audience")) {
        return new AppError(401, "INVALID_AUDIENCE", "Token not intended for this API");
    }

    return new AppError(401, "UNAUTHORIZED", "Invalid token");
}

/** Build the standard JSON error response for an AppError and record its code. */
function respondWithError(c: Context<any>, error: AppError) {
    setRequestErrorCode(c, error.code);
    return c.json(
        createErrorBody({
            code: error.code,
            message: error.message,
            status: error.statusCode,
            isRetryable: error.isRetryable,
            requestId: getRequestId(c),
        }),
        error.statusCode as any,
    );
}

/**
 * Synchronously ensures a `users` row exists for the authenticated subject.
 * Called on every write request BEFORE the route handler runs, preventing
 * FK violations from racing against a background upsert.
 */
async function ensureUserExists(env: Env, userId: string) {
    const db = getDbClient(env);
    await withRls(db, userId, async (tx) => {
        await tx.insert(users).values({ id: userId }).onConflictDoNothing();
    });
}

export const authMiddleware = createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables;
}>(async (c, next) => {
    const header = c.req.header("Authorization");
    const jwksUrl = c.env.NEON_AUTH_JWKS_URL;
    const expectedIssuer = c.env.JWT_ISSUER;
    const expectedAudience = c.env.JWT_AUDIENCE;

    try {
        if (!header?.startsWith("Bearer ")) {
            throw new AppError(401, "UNAUTHORIZED", "Missing token");
        }

        const token = header.slice(7);

        if (!jwksUrl) {
            throw new AppError(500, "INTERNAL_SERVER_ERROR", "Missing NEON_AUTH_JWKS_URL");
        }

        // Fail closed outside development: tokens MUST be bound to this API's
        // trusted issuer. Without it, jwtVerify degrades into a bare signature
        // check. Audience stays optional — Neon Auth's native tokens may omit
        // the `aud` claim — but is still verified when JWT_AUDIENCE is set.
        if (getDeploymentStage(c.env) !== "development" && !expectedIssuer) {
            throw new AppError(
                500,
                "AUTH_MISCONFIGURED",
                "JWT_ISSUER must be configured outside development",
            );
        }

        if (!jwksCache || cachedUrl !== jwksUrl) {
            jwksCache = createRemoteJWKSet(new URL(jwksUrl), {
                cooldownDuration: 30000,
                timeoutDuration: 5000,
            });
            cachedUrl = jwksUrl;
        }

        let payload;
        let attempt = 0;
        const maxRetries = 3;

        while (attempt < maxRetries) {
            try {
                const result = await jwtVerify(token, jwksCache, {
                    ...(expectedIssuer && { issuer: expectedIssuer }),
                    ...(expectedAudience && { audience: expectedAudience }),
                    clockTolerance: CLOCK_TOLERANCE_SECONDS,
                });
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

        // Synchronous user bootstrap on write requests to prevent FK race conditions (F02)
        const isWrite = c.req.method !== "GET" && c.req.method !== "HEAD";
        if (isWrite) {
            try {
                await ensureUserExists(c.env, payload.sub);
            } catch (dbErr) {
                logger.error("auth", "user_sync_failed", {
                    userHash: await hashIdentifier(payload.sub),
                    issues: issuesFromError(dbErr),
                });
                // Non-fatal: the user row may already exist. Let the route attempt proceed.
            }
        }
    } catch (e: any) {
        return respondWithError(c, e instanceof AppError ? e : classifyAuthFailure(e));
    }

    await next();
});
