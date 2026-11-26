import type { LiveChange } from "@cadence/contracts/live";
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
import { getRateLimitRedis } from "./redis";
import { tracing } from "cloudflare:workers";

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let cachedUrl = "";

const CLOCK_TOLERANCE_SECONDS = 30;

export type AuthVariables = {
    userId: string;
    userEmail?: string;
    requestId: string;
    requestStartedAt: number;
    errorCode?: string;
    liveAudience?: string[];
    liveChanges?: LiveChange[];
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

    if (isTransientKeyFailure(error)) {
        return new AppError(503, "AUTH_PROVIDER_UNAVAILABLE", "Authentication provider unavailable", true);
    }

    if (message.includes('"exp"') || message.includes("expired")) {
        return new AppError(401, "TOKEN_EXPIRED", "Session expired");
    }

    if (message.includes('"iss"') || message.includes("issuer")) {
        return new AppError(401, "INVALID_ISSUER", "Token issuer not trusted");
    }

    if (message.includes('"aud"') || message.includes("audience")) {
        return new AppError(401, "INVALID_AUDIENCE", "Token not intended for this API");
    }

    return new AppError(401, "UNAUTHORIZED", "Invalid token");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
        error.statusCode as any,
    );
}

const ensuredUsers = new Set<string>();

const DELETED_TTL_S = 60 * 60;
const deletedKey = (userHash: string) => `deleted:${userHash}`;

export async function markAccountDeleted(env: Env, userId: string): Promise<void> {
    ensuredUsers.delete(userId);
    try {
        await getRateLimitRedis(env)?.set(deletedKey(await hashIdentifier(userId)), "1", { ex: DELETED_TTL_S });
    } catch {}
}

async function ensureUserExists(env: Env, userId: string) {
    const deleted = await getRateLimitRedis(env)
        ?.get(deletedKey(await hashIdentifier(userId)))
        .catch(() => null);
    if (deleted) {
        ensuredUsers.delete(userId);
        throw new AppError(401, "UNAUTHORIZED", "This account was deleted");
    }
    if (ensuredUsers.has(userId)) return;
    const db = getDbClient(env);
    await withRls(db, userId, async (tx) => {
        await tx.insert(users).values({ id: userId }).onConflictDoNothing();
    });
    if (ensuredUsers.size >= 10_000) ensuredUsers.clear();
    ensuredUsers.add(userId);
}

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

function isTransientKeyFailure(err: unknown) {
    const { code, message } = (err ?? {}) as { code?: string; message?: string };
    return (
        code === "ERR_JOSE_GENERIC" ||
        code === "ERR_JWKS_TIMEOUT" ||
        Boolean(message?.includes("fetch") || message?.includes("network"))
    );
}

const MAX_VERIFY_ATTEMPTS = 3;

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

export async function verifyAppToken(env: Env, token: string): Promise<{ userId: string; email?: string }> {
    try {
        const jwksUrl = env.NEON_AUTH_JWKS_URL;
        const expectedIssuer = env.JWT_ISSUER;

        if (!jwksUrl) {
            throw new AppError(500, "INTERNAL_ERROR", "Missing NEON_AUTH_JWKS_URL");
        }

        if (getDeploymentStage(env) !== "development" && !expectedIssuer) {
            throw new AppError(500, "AUTH_MISCONFIGURED", "JWT_ISSUER must be configured outside development");
        }

        const payload = await verifyToken(token, keySetFor(jwksUrl), {
            ...(expectedIssuer && { issuer: expectedIssuer }),
            algorithms: ["EdDSA"],
            clockTolerance: CLOCK_TOLERANCE_SECONDS,
        });

        if (!payload?.sub) {
            throw new AppError(401, "UNAUTHORIZED", "Missing subject in token");
        }
        return { userId: payload.sub, ...(typeof payload.email === "string" && { email: payload.email }) };
    } catch (e) {
        throw e instanceof AppError ? e : classifyAuthFailure(e);
    }
}

export const authMiddleware = createMiddleware<{
    Bindings: Env;
    Variables: AuthVariables;
}>(async (c, next) => {
    const header = c.req.header("Authorization");

    try {
        if (!header?.startsWith("Bearer ")) {
            throw new AppError(401, "UNAUTHORIZED", "Missing token");
        }

        const { userId, email } = await verifyAppToken(c.env, header.slice(7));

        c.set("userId", userId);
        if (email) {
            c.set("userEmail", email);
        }

        const isWrite = c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.path !== "/api/v1/account/delete";
        if (isWrite) {
            try {
                await tracing.enterSpan("auth.user.ensure", () => ensureUserExists(c.env, userId));
            } catch (dbErr) {
                if (dbErr instanceof AppError) throw dbErr;
                logger.error("auth", "user_sync_failed", {
                    userHash: await hashIdentifier(userId),
                    issues: issuesFromError(dbErr),
                });
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    } catch (e: any) {
        return respondWithError(c, e instanceof AppError ? e : classifyAuthFailure(e));
    }

    await next();
});
