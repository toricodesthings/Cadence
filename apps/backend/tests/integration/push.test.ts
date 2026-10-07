import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { pushRoutes } from "../../src/domains/push/push.route";
import { prunePushDeliveries, runPushDispatch } from "../../src/domains/push/dispatch";
import { fromBase64Url, toBase64Url } from "../../src/domains/push/web-push";
import type { Env } from "../../src/types/env";

beforeAll(startTestDb);
afterEach(() => vi.unstubAllGlobals());

async function vapidEnv(): Promise<Env & Record<string, unknown>> {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey;
    const point = new Uint8Array([4, ...fromBase64Url(jwk.x!), ...fromBase64Url(jwk.y!)]);
    return { VAPID_PUBLIC_KEY: toBase64Url(point), VAPID_PRIVATE_KEY: jwk.d! } as Env & Record<string, unknown>;
}

async function keys() {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    return { p256dh: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer)), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) };
}

const endpointFor = () => `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
const sql = <T = any>(text: string, params: unknown[] = []) => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);

/** A user with notifications on, a registered device and a clock in Toronto. */
async function subscriber(env: Env & Record<string, unknown>, notifications: Record<string, unknown> = {}) {
    const userId = await createUser({ zone: "America/Toronto", settings: { notifications: { email: true, browser: true, ...notifications } } });
    const endpoint = endpointFor();
    const res = await apiAs(userId, "/push", pushRoutes, env)("PUT", "/subscription", { endpoint, keys: await keys() });
    expect(res.status).toBe(200);
    return { userId, endpoint };
}

const remind = (userId: string, title: string, at: string) =>
    sql("INSERT INTO tasks (user_id, title, order_index, reminder_at) VALUES ($1, $2, 1, $3)", [userId, title, at]);

const NOW = new Date("2026-10-07T15:00:30Z"); // 11:00 in Toronto

function pushService(status = 201) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return new Response(null, { status }); }));
    return calls;
}

describe("push routes", () => {
    it("offers no key until the server has VAPID keys, and refuses to register then", async () => {
        const userId = await createUser();
        const api = apiAs(userId, "/push", pushRoutes, {});
        expect((await api("GET", "/config")).body.data.publicKey).toBeNull();
        expect((await api("PUT", "/subscription", { endpoint: endpointFor(), keys: await keys() })).status).toBe(503);
    });

    it("registers a device, validates it, and gives an endpoint to one account at a time", async () => {
        const env = await vapidEnv();
        const [first, second] = [await createUser(), await createUser()];
        const endpoint = endpointFor();
        const body = { endpoint, keys: await keys() };
        expect((await apiAs(first, "/push", pushRoutes, env)("GET", "/config")).body.data.publicKey).toBe(env.VAPID_PUBLIC_KEY);
        expect((await apiAs(first, "/push", pushRoutes, env)("PUT", "/subscription", { ...body, endpoint: "https://evil.example/x" })).status).toBe(422);
        expect((await apiAs(first, "/push", pushRoutes, env)("PUT", "/subscription", { ...body, keys: { p256dh: "AAAA", auth: "AAAA" } })).status).toBe(422);
        expect((await apiAs(first, "/push", pushRoutes, env)("PUT", "/subscription", body)).status).toBe(200);
        expect((await apiAs(first, "/push", pushRoutes, env)("PUT", "/subscription", body)).status).toBe(200);
        expect((await apiAs(second, "/push", pushRoutes, env)("PUT", "/subscription", body)).status).toBe(200);
        expect(await sql("SELECT user_id FROM push_subscriptions WHERE endpoint = $1", [endpoint])).toEqual([{ user_id: second }]);
        expect((await apiAs(first, "/push", pushRoutes, env)("DELETE", "/subscription", { endpoint })).status).toBe(200);
        expect(await sql("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [endpoint])).toHaveLength(1);
        expect((await apiAs(second, "/push", pushRoutes, env)("DELETE", "/subscription", { endpoint })).status).toBe(200);
        expect(await sql("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [endpoint])).toHaveLength(0);
    });

    it("tests only the caller's own device through the push service", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        const other = await createUser();
        const calls = pushService();
        expect((await apiAs(other, "/push", pushRoutes, env)("POST", "/test", { endpoint })).status).toBe(404);
        expect(calls).toEqual([]);
        expect((await apiAs(userId, "/push", pushRoutes, env)("POST", "/test", { endpoint })).body.data.outcome).toBe("accepted");
        expect(calls).toEqual([endpoint]);
        pushService(410);
        expect((await apiAs(userId, "/push", pushRoutes, env)("POST", "/test", { endpoint })).body.data.outcome).toBe("gone");
        expect(await sql("SELECT 1 FROM push_subscriptions WHERE endpoint = $1", [endpoint])).toHaveLength(0);
    });
});

describe("push dispatch", () => {
    it("sends a due reminder once, even if the scheduler runs again", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Pay rent", "2026-10-07T14:59:00Z");
        const calls = pushService();
        await runPushDispatch(env, NOW);
        await runPushDispatch(env, new Date(NOW.getTime() + 60_000));
        expect(calls.filter((url) => url === endpoint)).toHaveLength(1);
        expect(await sql("SELECT status FROM push_deliveries WHERE user_id = $1", [userId])).toEqual([{ status: "sent" }]);
    });

    it("holds back reminders that are not due, too late, off, silenced, or dismissed", async () => {
        const env = await vapidEnv();
        const calls = pushService();
        const upcoming = await subscriber(env);
        await remind(upcoming.userId, "later", "2026-10-07T15:30:00Z");
        const stale = await subscriber(env);
        await remind(stale.userId, "stale", "2026-10-07T14:30:00Z");
        const off = await subscriber(env, { browser: false });
        await remind(off.userId, "off", "2026-10-07T14:59:00Z");
        const quiet = await subscriber(env, { quietHoursEnabled: true, quietHoursStart: "10:00", quietHoursEnd: "12:00" });
        await remind(quiet.userId, "quiet", "2026-10-07T14:59:00Z");
        const dismissed = await subscriber(env);
        await remind(dismissed.userId, "dismissed", "2026-10-07T14:59:00Z");
        const [{ id: taskId }] = await sql("SELECT id FROM tasks WHERE user_id = $1", [dismissed.userId]);
        await sql("INSERT INTO notification_state (user_id, object_type, object_id, trigger_id, dismissed_at) VALUES ($1, 'task', $2, $3, now())",
            [dismissed.userId, taskId, `task-reminder::${taskId}::2026-10-07T14:59:00.000Z`]);
        await runPushDispatch(env, NOW);
        for (const { endpoint } of [upcoming, stale, off, quiet, dismissed]) expect(calls).not.toContain(endpoint);
    });

    it("retries a failed send on a later run, then gives up on a gone device", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Call mum", "2026-10-07T14:59:00Z");
        const failing = pushService(503);
        await runPushDispatch(env, NOW);
        expect(failing).toContain(endpoint);
        const retry = pushService();
        await runPushDispatch(env, new Date(NOW.getTime() + 60_000));
        expect(retry).toContain(endpoint);
        expect(await sql("SELECT status, attempts FROM push_deliveries WHERE user_id = $1", [userId])).toEqual([{ status: "sent", attempts: 2 }]);

        const gone = await subscriber(env);
        await remind(gone.userId, "x", "2026-10-07T14:59:00Z");
        pushService(410);
        await runPushDispatch(env, NOW);
        expect(await sql("SELECT 1 FROM push_subscriptions WHERE user_id = $1", [gone.userId])).toHaveLength(0);
    });

    it("alerts a deadline at 09:00 on its day, and a deferral again at its new time", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await sql("INSERT INTO tasks (user_id, title, order_index, due_on, created_at) VALUES ($1, 'Tax', 1, '2026-10-07', '2026-10-01T12:00:00Z')", [userId]);
        const calls = pushService();
        await runPushDispatch(env, NOW); // 11:00: the 09:00 alert is still owed today
        expect(calls.filter((url) => url === endpoint)).toHaveLength(1);
        const [{ id: taskId }] = await sql("SELECT id FROM tasks WHERE user_id = $1", [userId]);
        await sql("INSERT INTO notification_state (user_id, object_type, object_id, trigger_id, deferred_until) VALUES ($1, 'task', $2, $3, '2026-10-07T20:00:00Z')",
            [userId, taskId, `task-due::${taskId}::2026-10-07`]);
        await runPushDispatch(env, new Date("2026-10-07T20:00:30Z"));
        expect(calls.filter((url) => url === endpoint)).toHaveLength(2);
    });

    it("prunes old claims only", async () => {
        const env = await vapidEnv();
        const { userId } = await subscriber(env);
        await remind(userId, "x", "2026-10-07T14:59:00Z");
        pushService();
        await runPushDispatch(env, NOW);
        await sql("UPDATE push_deliveries SET created_at = '2026-10-01T00:00:00Z' WHERE user_id = $1", [userId]);
        await remind(userId, "y", "2026-10-07T14:59:30Z");
        await runPushDispatch(env, NOW);
        await prunePushDeliveries(env, NOW);
        expect(await sql("SELECT 1 FROM push_deliveries WHERE user_id = $1", [userId])).toHaveLength(1);
    });
});
