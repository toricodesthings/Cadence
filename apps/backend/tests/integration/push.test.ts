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

type TestEnv = Env & Record<string, unknown>;

async function vapidEnv(): Promise<TestEnv> {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey) as JsonWebKey;
    const point = new Uint8Array([4, ...fromBase64Url(jwk.x!), ...fromBase64Url(jwk.y!)]);
    return { VAPID_PUBLIC_KEY: toBase64Url(point), VAPID_PRIVATE_KEY: jwk.d! } as TestEnv;
}

async function keys() {
    const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    return { p256dh: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer)), auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))) };
}

const endpointFor = () => `https://fcm.googleapis.com/fcm/send/${crypto.randomUUID()}`;
const sql = <T = any>(text: string, params: unknown[] = []) => asOwner(async (pg) => (await pg.query<T>(text, params)).rows);
const api = (userId: string, env: Record<string, unknown> = {}) => apiAs(userId, "/push", pushRoutes, env);

async function registerBrowser(env: TestEnv, userId: string, label = "Chrome on Windows") {
    const device = { installId: crypto.randomUUID(), kind: "computer" as const, label, endpoint: endpointFor() };
    const res = await api(userId, env)("PUT", "/devices", { ...device, subscription: { endpoint: device.endpoint, keys: await keys() } });
    expect(res.status).toBe(200);
    return device;
}

/** A user with notifications on, one registered browser, and a clock in Toronto. */
async function subscriber(env: TestEnv, notifications: Record<string, unknown> = {}) {
    const userId = await createUser({ zone: "America/Toronto", settings: { notifications: { email: true, browser: true, ...notifications } } });
    return { userId, ...await registerBrowser(env, userId) };
}

const remind = (userId: string, title: string, at: string) =>
    sql("INSERT INTO tasks (user_id, title, order_index, reminder_at) VALUES ($1, $2, 1, $3)", [userId, title, at]);

const NOW = new Date("2026-10-07T15:00:30Z"); // 11:00 in Toronto

function pushService(status = 201) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return new Response(null, { status }); }));
    return calls;
}

describe("devices", () => {
    it("offers no key until the server has VAPID keys, and refuses a subscription then", async () => {
        const userId = await createUser();
        expect((await api(userId)("GET", "/config")).body.data.publicKey).toBeNull();
        const res = await api(userId)("PUT", "/devices", { installId: crypto.randomUUID(), kind: "computer", label: "Chrome", subscription: { endpoint: endpointFor(), keys: await keys() } });
        expect(res.status).toBe(503);
    });

    it("registers a device without push, so the desktop app is listed and controllable", async () => {
        const env = await vapidEnv();
        const userId = await createUser();
        const installId = crypto.randomUUID();
        const res = await api(userId, env)("PUT", "/devices", { installId, kind: "desktop-app", label: "Cadence for Windows" });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([expect.objectContaining({ installId, kind: "desktop-app", label: "Cadence for Windows", enabled: true, push: false })]);
        // Nothing to push to: the test must say so rather than pretend it sent one.
        expect((await api(userId, env)("POST", "/test", { installId })).status).toBe(409);
    });

    it("validates a subscription and never returns endpoints or keys", async () => {
        const env = await vapidEnv();
        const userId = await createUser();
        const device = { installId: crypto.randomUUID(), kind: "computer", label: "Chrome" };
        expect((await api(userId, env)("PUT", "/devices", { ...device, subscription: { endpoint: "https://evil.example/x", keys: await keys() } })).status).toBe(422);
        expect((await api(userId, env)("PUT", "/devices", { ...device, subscription: { endpoint: endpointFor(), keys: { p256dh: "AAAA", auth: "AAAA" } } })).status).toBe(422);
        const { body } = await api(userId, env)("GET", "/devices");
        expect(body.data).toEqual([]);
        const saved = await registerBrowser(env, userId);
        const listed = (await api(userId, env)("GET", "/devices")).body.data[0];
        expect(listed).toMatchObject({ installId: saved.installId, push: true });
        expect(JSON.stringify(listed)).not.toContain(saved.endpoint);
    });

    it("keeps one row per browser across a changed endpoint, and gives it to one account at a time", async () => {
        const env = await vapidEnv();
        const [first, second] = [await createUser(), await createUser()];
        const installId = crypto.randomUUID();
        const endpoint = endpointFor();
        const body = { installId, kind: "computer", label: "Chrome", subscription: { endpoint, keys: await keys() } };
        await api(first, env)("PUT", "/devices", body);
        // The browser resubscribes with a new endpoint: the same device, not a second one.
        await api(first, env)("PUT", "/devices", { ...body, subscription: { endpoint: endpointFor(), keys: await keys() } });
        expect((await api(first, env)("GET", "/devices")).body.data).toHaveLength(1);
        // Someone else signs into that browser: the endpoint moves with it.
        await api(second, env)("PUT", "/devices", body);
        expect(await sql("SELECT user_id FROM devices WHERE endpoint = $1", [endpoint])).toEqual([{ user_id: second }]);
    });

    it("turns a device off from another device without touching the rest, and registering again respects that", async () => {
        const env = await vapidEnv();
        const { userId, installId } = await subscriber(env);
        const other = await registerBrowser(env, userId, "Safari on iPhone");
        expect((await api(userId, env)("PATCH", `/devices/${installId}`, { enabled: false })).body.data.enabled).toBe(false);
        const listed = (await api(userId, env)("GET", "/devices")).body.data;
        expect(listed.find((d: any) => d.installId === installId).enabled).toBe(false);
        expect(listed.find((d: any) => d.installId === other.installId).enabled).toBe(true);
        // A later visit from that browser must not silently switch it back on.
        await api(userId, env)("PUT", "/devices", { installId, kind: "computer", label: "Chrome on Windows" });
        expect((await api(userId, env)("GET", "/devices")).body.data.find((d: any) => d.installId === installId).enabled).toBe(false);
    });

    it("only lets a person see and change their own devices", async () => {
        const env = await vapidEnv();
        const { userId, installId } = await subscriber(env);
        const stranger = await createUser();
        expect((await api(stranger, env)("GET", "/devices")).body.data).toEqual([]);
        expect((await api(stranger, env)("PATCH", `/devices/${installId}`, { enabled: false })).status).toBe(404);
        expect((await api(stranger, env)("POST", "/test", { installId })).status).toBe(404);
        expect((await api(stranger, env)("DELETE", `/devices/${installId}`)).status).toBe(200);
        expect((await api(userId, env)("GET", "/devices")).body.data).toHaveLength(1);
    });

    it("tests through the real push path and forgets a device the service has dropped", async () => {
        const env = await vapidEnv();
        const { userId, installId, endpoint } = await subscriber(env);
        const calls = pushService();
        expect((await api(userId, env)("POST", "/test", { installId })).body.data.outcome).toBe("accepted");
        expect(calls).toEqual([endpoint]);
        pushService(410);
        expect((await api(userId, env)("POST", "/test", { installId })).body.data.outcome).toBe("gone");
        expect((await api(userId, env)("GET", "/devices")).body.data).toEqual([]);
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

    it("reminds a routine's open time on an untouched day, and not one already marked", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        const [{ id }] = await sql("INSERT INTO habits (user_id, title, recurrence_rule, reminder_enabled, times, created_at) VALUES ($1, 'Medication', 'FREQ=DAILY', true, '[\"08:00\",\"11:10\",\"20:00\"]', '2026-10-01T12:00:00Z') RETURNING id", [userId]);
        const calls = pushService();
        await runPushDispatch(env, NOW); // no log exists yet today
        expect(calls.filter((url) => url === endpoint)).toHaveLength(1);

        await sql("INSERT INTO habit_logs (habit_id, user_id, target_date, status, time_marks) VALUES ($1, $2, '2026-10-07', 'PENDING', $3)", [id, userId, JSON.stringify({ "11:10": { status: "COMPLETED", at: "2026-10-07T15:00:00Z" } })]);
        await runPushDispatch(env, new Date(NOW.getTime() + 60_000));
        expect(calls.filter((url) => url === endpoint)).toHaveLength(1); // the marked time doesn't alert again
    });

    it("skips a device the person turned off, and keeps sending to their others", async () => {
        const env = await vapidEnv();
        const { userId, installId, endpoint } = await subscriber(env);
        const phone = await registerBrowser(env, userId, "Safari on iPhone");
        await api(userId, env)("PATCH", `/devices/${installId}`, { enabled: false });
        await remind(userId, "Pay rent", "2026-10-07T14:59:00Z");
        const calls = pushService();
        await runPushDispatch(env, NOW);
        expect(calls).toEqual([phone.endpoint]);
        expect(calls).not.toContain(endpoint);
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

    it("alerts before a timed block by its lead, and stays silent while paused", async () => {
        const env = await vapidEnv();
        const calls = pushService();
        const block = (userId: string, start: string) =>
            sql("INSERT INTO tasks (user_id, title, order_index, scheduled_start, scheduled_end, zone) VALUES ($1, 'Standup', 1, $2, $3::timestamptz + interval '30 minutes', 'America/Toronto')", [userId, start, start]);
        const early = await subscriber(env);
        await block(early.userId, "2026-10-07T15:10:00Z"); // starts in 10 min (default lead 10)
        const tooFar = await subscriber(env);
        await block(tooFar.userId, "2026-10-07T15:40:00Z");
        const paused = await subscriber(env, { pausedUntil: "2026-10-07T16:00:00Z" });
        await block(paused.userId, "2026-10-07T15:10:00Z");
        await runPushDispatch(env, NOW);
        expect(calls).toContain(early.endpoint);
        expect(calls).not.toContain(tooFar.endpoint);
        expect(calls).not.toContain(paused.endpoint);
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
        expect(await sql("SELECT 1 FROM devices WHERE user_id = $1", [gone.userId])).toHaveLength(0);
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
