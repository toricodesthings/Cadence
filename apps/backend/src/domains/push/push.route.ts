import { Hono } from "hono";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { withCallerRls } from "../../platform/caller-rls";
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
import { replanReminders } from "./reminder-clock";
import { hasValidPushKeys, isAllowedPushEndpoint, sendWebPush, vapidConfigured } from "./web-push";

const MAX_DEVICES = 15;

type DeviceRow = typeof devices.$inferSelect;

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
    tx
        .select()
        .from(devices)
        .where(eq(devices.userId, userId))
        .orderBy(desc(devices.lastSeenAt), desc(devices.createdAt));

export const pushRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get("/config", (c) => {
        const config: PushConfig = { publicKey: vapidConfigured(c.env) ? c.env.VAPID_PUBLIC_KEY! : null };
        return c.json({ data: config }, 200);
    })
    .get("/devices", async (c) => {
        const userId = c.get("userId");
        const rows = await withRls(getDbClient(c.env), userId, (tx) => listDevices(tx, userId));
        return c.json({ data: rows.map(toDevice) }, 200);
    })
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
        const push = subscription
            ? { endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth }
            : { endpoint: null, p256dh: null, auth: null };

        let released: string[] = [];
        const rows = await withRls(getDbClient(c.env), userId, async (tx) => {
            if (subscription) {
                const owners = await tx
                    .select({ id: sql<string | null>`r.id` })
                    .from(sql`push_release_endpoint(${subscription.endpoint}, ${userId}::uuid) AS r(id)`);
                released = [...new Set(owners.map((owner) => owner.id).filter((id): id is string => Boolean(id)))];
                await tx
                    .delete(devices)
                    .where(
                        and(
                            eq(devices.userId, userId),
                            eq(devices.endpoint, subscription.endpoint),
                            ne(devices.installId, installId),
                        ),
                    );
            }
            await tx
                .insert(devices)
                .values({ userId, installId, kind, label, lastSeenAt: seenAt, ...push })
                .onConflictDoUpdate({
                    target: [devices.userId, devices.installId],
                    set: { kind, label, lastSeenAt: seenAt, failureCount: 0, ...push },
                });
            await tx.execute(sql`
                DELETE FROM devices WHERE user_id = ${userId}::uuid AND id NOT IN (
                    SELECT id FROM devices WHERE user_id = ${userId}::uuid
                    ORDER BY coalesce(last_seen_at, created_at) DESC LIMIT ${MAX_DEVICES})`);
            return listDevices(tx, userId);
        });
        if (released.length > 0)
            c.executionCtx.waitUntil(Promise.all(released.map((id) => replanReminders(c.env, id))));
        return c.json({ data: rows.map(toDevice) }, 200);
    })
    .patch(
        "/devices/:id",
        apiValidator("param", uuidParamSchema),
        apiValidator("json", devicePatchSchema),
        async (c) => {
            const userId = c.get("userId");
            const [row] = await withRls(getDbClient(c.env), userId, (tx) =>
                tx
                    .update(devices)
                    .set({ enabled: c.req.valid("json").enabled })
                    .where(and(eq(devices.userId, userId), eq(devices.installId, c.req.valid("param").id)))
                    .returning(),
            );
            throwIfNotFound(row, "Device");
            return c.json({ data: toDevice(row) }, 200);
        },
    )
    .delete("/devices/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        await withRls(getDbClient(c.env), userId, (tx) =>
            tx.delete(devices).where(and(eq(devices.userId, userId), eq(devices.installId, c.req.valid("param").id))),
        );
        return c.json({ data: { removed: true } }, 200);
    })
    .post("/test", apiValidator("json", pushTestSchema), async (c) => {
        const [device] = await withCallerRls(c, (tx, userId) =>
            tx
                .select()
                .from(devices)
                .where(and(eq(devices.userId, userId), eq(devices.installId, c.req.valid("json").installId))),
        );
        throwIfNotFound(device, "Device");
        if (!device.endpoint || !device.p256dh || !device.auth) {
            throw new AppError(
                409,
                "PUSH_UNAVAILABLE",
                "This device shows reminders itself; there is nothing for the server to send.",
            );
        }
        if (!vapidConfigured(c.env))
            throw new AppError(503, "PUSH_UNAVAILABLE", "Device notifications aren't available right now.", true);

        const outcome = await sendWebPush(
            c.env,
            { endpoint: device.endpoint, p256dh: device.p256dh, auth: device.auth },
            {
                title: "Cadence test notification",
                body: "If you can see this, reminders will reach this device.",
                route: null,
                tag: "cadence-test",
            },
        );
        if (outcome === "gone")
            await withCallerRls(c, (tx, userId) =>
                tx.delete(devices).where(and(eq(devices.id, device.id), eq(devices.userId, userId))),
            );
        const result: PushTestResult = { outcome };
        return c.json({ data: result }, 200);
    });
