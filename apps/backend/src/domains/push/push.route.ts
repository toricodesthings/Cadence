import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { pushSubscriptions } from "../../db/schema";
import { AppError } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { pushEndpointSchema, pushSubscriptionInputSchema, type PushConfig, type PushTestResult } from "@cadence/contracts/push";
import { hasValidPushKeys, isAllowedPushEndpoint, sendWebPush, vapidConfigured } from "./web-push";

/** A person's devices: more than this and the oldest registration is dropped. */
const MAX_DEVICES = 10;

const requirePush = (env: Env) => {
    if (!vapidConfigured(env)) throw new AppError(503, "PUSH_UNAVAILABLE", "Device notifications aren't available right now.", true);
};

export const pushRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // The public VAPID key the browser subscribes with. No key = push is off.
    .get("/config", (c) => {
        const config: PushConfig = { publicKey: vapidConfigured(c.env) ? c.env.VAPID_PUBLIC_KEY! : null };
        return c.json({ data: config }, 200);
    })
    // Register (or refresh) this browser. The endpoint and keys are validated before they are stored.
    .put("/subscription", apiValidator("json", pushSubscriptionInputSchema), async (c) => {
        requirePush(c.env);
        const { endpoint, keys } = c.req.valid("json");
        if (!isAllowedPushEndpoint(endpoint) || !hasValidPushKeys(keys)) {
            throw new AppError(422, "VALIDATION_ERROR", "That notification registration isn't valid.");
        }
        const userId = c.get("userId");
        await withRls(getDbClient(c.env), userId, async (tx) => {
            await tx.execute(sql`SELECT push_release_endpoint(${endpoint}, ${userId}::uuid)`);
            await tx
                .insert(pushSubscriptions)
                .values({ userId, endpoint, p256dh: keys.p256dh, auth: keys.auth })
                .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { p256dh: keys.p256dh, auth: keys.auth, failureCount: 0 } });
            await tx.execute(sql`
                DELETE FROM push_subscriptions WHERE user_id = ${userId}::uuid AND id NOT IN (
                    SELECT id FROM push_subscriptions WHERE user_id = ${userId}::uuid ORDER BY created_at DESC LIMIT ${MAX_DEVICES})`);
        });
        return c.json({ data: { registered: true } }, 200);
    })
    // Turn this device off. Other devices keep theirs.
    .delete("/subscription", apiValidator("json", pushEndpointSchema), async (c) => {
        const userId = c.get("userId");
        await withRls(getDbClient(c.env), userId, (tx) =>
            tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, c.req.valid("json").endpoint))));
        return c.json({ data: { registered: false } }, 200);
    })
    // One explicit test to this device only, through the real push path. It ignores quiet hours and saved preferences.
    .post("/test", apiValidator("json", pushEndpointSchema), async (c) => {
        requirePush(c.env);
        const userId = c.get("userId");
        const db = getDbClient(c.env);
        const [subscription] = await withRls(db, userId, (tx) =>
            tx.select().from(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, c.req.valid("json").endpoint))));
        if (!subscription) throw new AppError(404, "NOT_FOUND", "This device isn't registered for notifications.");
        const outcome = await sendWebPush(c.env, subscription, {
            title: "Cadence test notification",
            body: "If you can see this, reminders will reach this device.",
            route: null,
            tag: "cadence-test",
        });
        if (outcome === "gone") await withRls(db, userId, (tx) => tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id)));
        const result: PushTestResult = { outcome };
        return c.json({ data: result }, 200);
    });
