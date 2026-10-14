import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Env } from "../types/env";
import { getDeploymentStage } from "../types/env";
import { AppError, createErrorBody } from "./errors";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyOptions } from "jose";
import { getRequestId, setRequestErrorCode } from "./request-log";
import { logger, hashIdentifier, issuesFromError } from "./log";
import { getDbClient } from "./db";
import { withRls } from "./rls";
import { users } from "../db/schema";
import { tracing } from "cloudflare:workers";

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
 * Users whose row this isolate already ensured. Rows are never deleted by the app,
 * so a hit skips a whole transaction on every later write.
 */
const ensuredUsers = new Set<string>();

/**
 * Ensures a `users` row exists for the authenticated subject before a write's
 * handler runs, preventing FK violations. Once per user per isolate.
 */
async function ensureUserExists(env: Env, userId: string) {
    if (ensuredUsers.has(userId)) return;
    const db = getDbClient(env);
    await withRls(db, userId, async (tx) => {
        await tx.insert(users).values({ id: userId }).onConflictDoNothing();
    });
    if (ensuredUsers.size >= 10_000) ensuredUsers.clear();
    ensuredUsers.add(userId);
}

/** The remote key set for this URL, kept across requests. */
function keySetFor(jwksUrl: string) {
    if (!jwksCache || cachedUrl !== jwksUrl) {
        jwksCache = createRemoteJWKSet(new URL(jwksUrl), {
            cooldownDuration: 30000,
            timeoutDuration: 5000,
        });
        cachedUrl = jwksUrl;
    }
    return jwksCache;
}

/** A failure fetching the key set is worth retrying; a bad token is not. */
function isTransientKeyFailure(err: unknown) {
    const { code, message } = (err ?? {}) as { code?: string; message?: string };
    return code === "ERR_JOSE_GENERIC" || Boolean(message?.includes("fetch") || message?.includes("network"));
}

const MAX_VERIFY_ATTEMPTS = 3;

/** Verify the token, retrying a transient key-set failure with backoff (200ms, then 400ms). */
async function verifyToken(token: string, keySet: ReturnType<typeof createRemoteJWKSet>, options: JWTVerifyOptions) {
    for (let attempt = 1; ; attempt++) {
        try {
            return (await tracing.enterSpan("auth.verify", () => jwtVerify(token, keySet, options))).payload;
        } catch (err) {
            if (!isTransientKeyFailure(err) || attempt >= MAX_VERIFY_ATTEMPTS) throw err;
            await new Promise((res) => setTimeout(res, Math.pow(2, attempt) * 100));
        }
    }
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
            throw new AppError(500, "INTERNAL_ERROR", "Missing NEON_AUTH_JWKS_URL");
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

        const payload = await verifyToken(token, keySetFor(jwksUrl), {
            ...(expectedIssuer && { issuer: expectedIssuer }),
            ...(expectedAudience && { audience: expectedAudience }),
            clockTolerance: CLOCK_TOLERANCE_SECONDS,
        });

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
            const userId = payload.sub;
            try {
                await tracing.enterSpan("auth.user.ensure", () => ensureUserExists(c.env, userId));
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
