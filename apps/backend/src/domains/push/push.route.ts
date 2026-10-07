import { Hono } from "hono";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { devices } from "../../db/schema";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { apiValidator } from "../../platform/validation";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import {
    deviceRegistrationSchema,
    devicePatchSchema,
    pushTestSchema,
    type Device,
    type PushConfig,
    type PushTestResult,
} from "@cadence/contracts/push";
import { uuidParamSchema } from "@cadence/contracts/common";
import { hasValidPushKeys, isAllowedPushEndpoint, sendWebPush, vapidConfigured } from "./web-push";

/** A person's devices: past this, the oldest registration is dropped. */
const MAX_DEVICES = 15;

type DeviceRow = typeof devices.$inferSelect;

/** What the client may see: never an endpoint or a key. */
const toDevice = (row: DeviceRow): Device => ({
    installId: row.installId,
    kind: row.kind as Device["kind"],
    label: row.label,
    enabled: row.enabled,
    push: !!row.endpoint,
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
});

const listDevices = (tx: Parameters<Parameters<typeof withRls>[2]>[0], userId: string) =>
    tx.select().from(devices).where(eq(devices.userId, userId)).orderBy(desc(devices.lastSeenAt), desc(devices.createdAt));

export const pushRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // The public VAPID key the browser subscribes with. No key = push is off and devices stay local.
    .get("/config", (c) => {
        const config: PushConfig = { publicKey: vapidConfigured(c.env) ? c.env.VAPID_PUBLIC_KEY! : null };
        return c.json({ data: config }, 200);
    })
    // Every device the account has, so any one of them can turn another off.
    .get("/devices", async (c) => {
        const userId = c.get("userId");
        const rows = await withRls(getDbClient(c.env), userId, (tx) => listDevices(tx, userId));
        return c.json({ data: rows.map(toDevice) }, 200);
    })
    /**
     * Registers or refreshes the calling device, and marks it seen. A device may register without a
     * subscription (the desktop app, or a browser whose push the user hasn't allowed): it then shows
     * reminders itself while Cadence runs, and the server sends it nothing.
     */
    .put("/devices", apiValidator("json", deviceRegistrationSchema), async (c) => {
        const { installId, kind, label, subscription } = c.req.valid("json");
        if (subscription && (!isAllowedPushEndpoint(subscription.endpoint) || !hasValidPushKeys(subscription.keys))) {
            throw new AppError(422, "VALIDATION_ERROR", "That notification registration isn't valid.");
        }
        if (subscription && !vapidConfigured(c.env)) {
            throw new AppError(503, "PUSH_UNAVAILABLE", "Device notifications aren't available right now.", true);
        }
        const userId = c.get("userId");
        const seenAt = new Date().toISOString();
        const push = subscription ? { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } : { endpoint: null, p256dh: null, auth: null };

        const rows = await withRls(getDbClient(c.env), userId, async (tx) => {
            if (subscription) {
                // One account at a time per browser endpoint, and never two rows of this user for one endpoint.
                await tx.execute(sql`SELECT push_release_endpoint(${subscription.endpoint}, ${userId}::uuid)`);
                await tx.delete(devices).where(and(eq(devices.userId, userId), eq(devices.endpoint, subscription.endpoint), ne(devices.installId, installId)));
            }
            await tx
                .insert(devices)
                .values({ userId, installId, kind, label, lastSeenAt: seenAt, ...push })
                .onConflictDoUpdate({
                    target: [devices.userId, devices.installId],
                    // Registering again never silently re-enables a device the person turned off.
                    set: { kind, label, lastSeenAt: seenAt, failureCount: 0, ...push },
                });
            await tx.execute(sql`
                DELETE FROM devices WHERE user_id = ${userId}::uuid AND id NOT IN (
                    SELECT id FROM devices WHERE user_id = ${userId}::uuid
                    ORDER BY coalesce(last_seen_at, created_at) DESC LIMIT ${MAX_DEVICES})`);
            return listDevices(tx, userId);
        });
        return c.json({ data: rows.map(toDevice) }, 200);
    })
    // Turn a device on or off from anywhere, including this one.
    .patch("/devices/:id", apiValidator("param", uuidParamSchema), apiValidator("json", devicePatchSchema), async (c) => {
        const userId = c.get("userId");
        const [row] = await withRls(getDbClient(c.env), userId, (tx) =>
            tx.update(devices).set({ enabled: c.req.valid("json").enabled })
                .where(and(eq(devices.userId, userId), eq(devices.installId, c.req.valid("param").id)))
                .returning());
        throwIfNotFound(row, "Device");
        return c.json({ data: toDevice(row) }, 200);
    })
    // Forget a device entirely (signing out, or clearing one from the list).
    .delete("/devices/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        await withRls(getDbClient(c.env), userId, (tx) =>
            tx.delete(devices).where(and(eq(devices.userId, userId), eq(devices.installId, c.req.valid("param").id))));
        return c.json({ data: { removed: true } }, 200);
    })
    // One explicit test through this device's real delivery path. It ignores quiet hours and saved preferences.
    .post("/test", apiValidator("json", pushTestSchema), async (c) => {
        const userId = c.get("userId");
        const db = getDbClient(c.env);
        const [device] = await withRls(db, userId, (tx) =>
            tx.select().from(devices).where(and(eq(devices.userId, userId), eq(devices.installId, c.req.valid("json").installId))));
        throwIfNotFound(device, "Device");
        if (!device.endpoint || !device.p256dh || !device.auth) {
            throw new AppError(409, "PUSH_UNAVAILABLE", "This device shows reminders itself; there is nothing for the server to send.");
        }
        if (!vapidConfigured(c.env)) throw new AppError(503, "PUSH_UNAVAILABLE", "Device notifications aren't available right now.", true);

        const outcome = await sendWebPush(c.env, { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth }, {
            title: "Cadence test notification",
            body: "If you can see this, reminders will reach this device.",
            route: null,
            tag: "cadence-test",
        });
        if (outcome === "gone") await withRls(db, userId, (tx) => tx.delete(devices).where(eq(devices.id, device.id)));
        const result: PushTestResult = { outcome };
        return c.json({ data: result }, 200);
    });
