import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { deleteAccountSchema } from "@cadence/contracts/account";
import { users } from "../../db/schema";
import type { AuthVariables } from "../../platform/auth";
import { getDbClient } from "../../platform/db";
import { AppError } from "../../platform/errors";
import { hashIdentifier, logger } from "../../platform/log";
import { withRls } from "../../platform/rls";
import { apiValidator } from "../../platform/validation";
import type { Env } from "../../types/env";
import { backgroundPrefix } from "../settings/background-image";
import { revokeAllGrants } from "../mcp/oauth";

/** Deletes every object under `prefix` (R2 lists 1,000 keys a page and deletes at most 1,000 per call). */
async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
    let cursor: string | undefined;
    do {
        const page = await bucket.list({ prefix, cursor });
        const keys = page.objects.map((object) => object.key);
        if (keys.length > 0) await bucket.delete(keys);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
}

const JWKS_SUFFIX = "/.well-known/jwks.json";

/** Neon Auth's base URL, from the JWKS URL the API already trusts (`{base}/.well-known/jwks.json`). */
function authBaseUrl(env: Env): string {
    const jwks = env.NEON_AUTH_JWKS_URL;
    if (!jwks?.endsWith(JWKS_SUFFIX)) {
        throw new AppError(503, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion is not available right now");
    }
    return jwks.slice(0, -JWKS_SUFFIX.length);
}

/**
 * Proves the person is present, not just holding a session token: Neon Auth must accept their password, or the
 * code it emailed them. A stolen token alone can't delete an account. Neon Auth rate-limits both checks.
 */
export async function verifyPresence(
    env: Env,
    identity: { userId: string; email?: string },
    proof: { password?: string; otp?: string },
): Promise<void> {
    const fail = () => new AppError(403, "REAUTH_FAILED", proof.password ? "That password isn't right" : "That code isn't right or has expired");
    if (!identity.email || (!proof.password && !proof.otp)) {
        throw new AppError(403, "REAUTH_FAILED", "Confirm it's you with your password or an emailed code");
    }
    const base = authBaseUrl(env);
    const res = proof.password
        ? await fetch(`${base}/sign-in/email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: identity.email, password: proof.password, rememberMe: false }),
        })
        : await fetch(`${base}/email-otp/check-verification-otp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: identity.email, type: "sign-in", otp: proof.otp }),
        });
    if (!res.ok) throw fail();
    const body = (await res.json().catch(() => null)) as { user?: { id?: string }; success?: boolean } | null;
    // A password must belong to this very account; an OTP check answers only success
    const ok = proof.password ? body?.user?.id === identity.userId : body?.success === true;
    if (!ok) throw fail();
}

/** Removes the sign-in identity. A 404 means it is already gone, which is what a retry wants. */
export async function deleteAuthUser(env: Env, userId: string): Promise<void> {
    const { NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID } = env;
    if (!NEON_API_KEY || !NEON_PROJECT_ID || !NEON_BRANCH_ID) {
        throw new AppError(503, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion is not available right now");
    }
    // Defense in depth: `sub` is signed by Neon Auth, but it goes into an admin URL, so only a plain UUID may
    if (!z.uuid().safeParse(userId).success) throw new AppError(400, "VALIDATION_ERROR", "Invalid account id");
    const res = await fetch(
        `https://console.neon.tech/api/v2/projects/${encodeURIComponent(NEON_PROJECT_ID)}/branches/${encodeURIComponent(NEON_BRANCH_ID)}/auth/users/${userId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${NEON_API_KEY}` } },
    );
    if (!res.ok && res.status !== 404) {
        throw new AppError(502, "UPSTREAM_ERROR", "Could not remove the sign-in account. Nothing more was deleted; try again", true);
    }
}

/**
 * Permanent account deletion. The order is deliberate: files, then connected-assistant grants, then the
 * workspace (one `users` row; every table cascades from it), and the sign-in identity last. A failure
 * before the last step leaves a signed-in user who can simply retry; nothing is ever left with no owner.
 */
export const accountRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // POST /account/delete — body carries the confirmation phrase plus a password or emailed code. There is no undo.
    .post("/delete", apiValidator("json", deleteAccountSchema), async (c) => {
        const userId = c.get("userId");
        const { NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID } = c.env;
        // Refuse before touching anything if the last step could not run
        if (!NEON_API_KEY || !NEON_PROJECT_ID || !NEON_BRANCH_ID) {
            throw new AppError(503, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion is not available right now");
        }

        const { password, otp } = c.req.valid("json");
        await verifyPresence(c.env, { userId, email: c.get("userEmail") }, { password, otp });

        const userHash = await hashIdentifier(userId);
        if (c.env.USER_ASSETS) {
            await deletePrefix(c.env.USER_ASSETS, backgroundPrefix(userId));
            await deletePrefix(c.env.USER_ASSETS, `ai-images/${userHash}/`);
        }
        await revokeAllGrants(c.env, userId);
        await withRls(getDbClient(c.env), userId, (tx) => tx.delete(users).where(eq(users.id, userId)));
        await deleteAuthUser(c.env, userId);

        logger.info("auth", "account_deleted", { userHash });
        return c.json({ data: { deleted: true } }, 200);
    });
