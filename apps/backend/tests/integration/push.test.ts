import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { asOwner, createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { pushRoutes } from "../../src/domains/push/push.route";
import { Hono } from "hono";
import { ReminderClock, replanAfterWrites } from "../../src/domains/push/reminder-clock";
import { mergeOutcomes } from "../../src/domains/push/plan";
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

/** A person's clock over in-memory Durable Object storage; `alarm` is where it last armed itself. */
function clockFor(env: TestEnv) {
    const data = new Map<string, unknown>();
    const state = {
        alarm: null as number | null,
        storage: {
            get: async (key: string) => structuredClone(data.get(key)),
            put: async (key: string | Record<string, unknown>, value?: unknown) => {
                for (const [k, v] of Object.entries(typeof key === "string" ? { [key]: value } : key)) data.set(k, structuredClone(v));
            },
            delete: async (key: string) => data.delete(key),
            deleteAll: async () => data.clear(),
            setAlarm: async (at: number) => { state.alarm = at; },
            deleteAlarm: async () => { state.alarm = null; },
        },
    };
    const clock = new ReminderClock(state as never, env);
    return { clock, state, data, plan: () => data.get("plan") as { entries: Array<{ at: number; key: string }> } };
}

/** A write happened (rebuild at `at`), then the alarm went off at `fireAt`. */
async function replanAndFire(env: TestEnv, userId: string, at: Date, fireAt: Date = at) {
    const c = clockFor(env);
    await c.clock.replan(userId, at);
    await c.clock.fire(fireAt);
    return c;
}

/** A `REMINDER_CLOCK` binding that records whose clock was asked to rebuild. */
function clockNamespace(replanned: string[]) {
    return { idFromName: (name: string) => name, get: (id: string) => ({ replan: async () => { replanned.push(id); } }) };
}

const count = (calls: string[], endpoint: string) => calls.filter((url) => url === endpoint).length;
const later = (ms: number) => new Date(NOW.getTime() + ms);

describe("reminder clock", () => {
    it("sends a due reminder once, across alarms and rebuilds", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Pay rent", "2026-10-07T14:59:00Z");
        const calls = pushService();
        const { clock } = await replanAndFire(env, userId, NOW);
        await clock.fire(later(60_000));
        await clock.replan(userId, later(90_000));
        await clock.fire(later(90_000));
        expect(count(calls, endpoint)).toBe(1);
    });

    it("arms its alarm for the next alert's exact instant, and sends it then without asking Postgres", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Call mum", "2026-10-07T17:00:00Z");
        const calls = pushService();
        const { clock, state } = clockFor(env);
        await clock.replan(userId, NOW);
        expect(state.alarm).toBe(Date.parse("2026-10-07T17:00:00Z"));
        await clock.fire(new Date(state.alarm!));
        expect(count(calls, endpoint)).toBe(1);
    });

    it("never sends a reminder that was edited, deleted or marked after the plan was made", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Moved", "2026-10-07T17:00:00Z");
        await remind(userId, "Deleted", "2026-10-07T17:30:00Z");
        const [{ id: habitId }] = await sql("INSERT INTO habits (user_id, title, recurrence_rule, reminder_enabled, times, created_at) VALUES ($1, 'Medication', 'FREQ=DAILY', true, '[\"14:00\"]', '2026-10-01T12:00:00Z') RETURNING id", [userId]);
        const calls = pushService();
        const { clock, plan } = clockFor(env);
        await clock.replan(userId, NOW);
        // The routine's 14:00 (15 min lead) today and tomorrow, both inside the 36-hour plan.
        expect(plan().entries.map((e) => new Date(e.at).toISOString())).toEqual(["2026-10-07T17:00:00.000Z", "2026-10-07T17:30:00.000Z", "2026-10-07T17:45:00.000Z", "2026-10-08T17:45:00.000Z"]);

        await sql("UPDATE tasks SET reminder_at = '2026-10-07T19:00:00Z' WHERE user_id = $1 AND title = 'Moved'", [userId]);
        await sql("DELETE FROM tasks WHERE user_id = $1 AND title = 'Deleted'", [userId]);
        await sql("INSERT INTO habit_logs (habit_id, user_id, target_date, status, time_marks) VALUES ($1, $2, '2026-10-07', 'PENDING', $3)", [habitId, userId, JSON.stringify({ "14:00": { status: "COMPLETED", at: "2026-10-07T16:00:00Z" } })]);
        await clock.replan(userId, later(60_000));
        for (const at of ["2026-10-07T17:00:00Z", "2026-10-07T17:30:00Z", "2026-10-07T17:45:00Z"]) await clock.fire(new Date(at));
        expect(calls).toEqual([]);
        await clock.fire(new Date("2026-10-07T19:00:00Z"));
        expect(count(calls, endpoint)).toBe(1);
    });

    it("reminds a routine's open time on an untouched day", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await sql("INSERT INTO habits (user_id, title, recurrence_rule, reminder_enabled, times, created_at) VALUES ($1, 'Medication', 'FREQ=DAILY', true, '[\"08:00\",\"11:10\",\"20:00\"]', '2026-10-01T12:00:00Z')", [userId]);
        const calls = pushService();
        await replanAndFire(env, userId, NOW); // no log exists yet today
        expect(count(calls, endpoint)).toBe(1);
    });

    it("skips a device the person turned off, and keeps sending to their others", async () => {
        const env = await vapidEnv();
        const { userId, installId, endpoint } = await subscriber(env);
        const phone = await registerBrowser(env, userId, "Safari on iPhone");
        await api(userId, env)("PATCH", `/devices/${installId}`, { enabled: false });
        await remind(userId, "Pay rent", "2026-10-07T14:59:00Z");
        const calls = pushService();
        await replanAndFire(env, userId, NOW);
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
        for (const { userId } of [upcoming, stale, off, quiet, dismissed]) await replanAndFire(env, userId, NOW);
        for (const { endpoint } of [upcoming, stale, off, quiet, dismissed]) expect(calls).not.toContain(endpoint);
    });

    it("holds an alert in quiet hours and sends it when they end", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env, { quietHoursEnabled: true, quietHoursStart: "10:00", quietHoursEnd: "12:00" });
        await remind(userId, "Quiet", "2026-10-07T14:59:00Z");
        const calls = pushService();
        const { clock, state } = await replanAndFire(env, userId, NOW);
        expect(calls).toEqual([]);
        expect(state.alarm).toBe(Date.parse("2026-10-07T16:00:00Z")); // 12:00 in Toronto
        await clock.fire(new Date(state.alarm!));
        expect(count(calls, endpoint)).toBe(1);
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
        for (const { userId } of [early, tooFar, paused]) await replanAndFire(env, userId, NOW);
        expect(calls).toContain(early.endpoint);
        expect(calls).not.toContain(tooFar.endpoint);
        expect(calls).not.toContain(paused.endpoint);
    });

    it("keeps a repeating block's local time across the DST change", async () => {
        const env = await vapidEnv();
        const { userId } = await subscriber(env);
        // Daily 09:00 in Toronto; Nov 1 2026 falls back from EDT (-4) to EST (-5).
        await sql("INSERT INTO tasks (user_id, title, order_index, scheduled_start, scheduled_end, zone, recurrence_rule) VALUES ($1, 'Class', 1, '2026-10-30T13:00:00Z', '2026-10-30T14:00:00Z', 'America/Toronto', 'FREQ=DAILY')", [userId]);
        const { clock, plan } = clockFor(env);
        await clock.replan(userId, new Date("2026-10-31T12:00:00Z"));
        expect(plan().entries.map((e) => new Date(e.at).toISOString())).toEqual(["2026-10-31T12:50:00.000Z", "2026-11-01T13:50:00.000Z"]);
    });

    it("retries a failed send, then forgets a gone device and writes both back on the next rebuild", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Call mum", "2026-10-07T14:59:00Z");
        const failing = pushService(503);
        const { clock, state } = await replanAndFire(env, userId, NOW);
        expect(failing).toContain(endpoint);
        expect(state.alarm).toBe(later(60_000).getTime());
        const retry = pushService();
        await clock.fire(later(60_000));
        expect(retry).toContain(endpoint);
        await clock.replan(userId, later(120_000));
        expect(await sql("SELECT failure_count, last_success_at IS NOT NULL AS ok FROM devices WHERE user_id = $1", [userId])).toEqual([{ failure_count: 0, ok: true }]);

        const gone = await subscriber(env);
        await remind(gone.userId, "x", "2026-10-07T14:59:00Z");
        pushService(410);
        const goneClock = await replanAndFire(env, gone.userId, NOW);
        await goneClock.clock.replan(gone.userId, later(60_000));
        expect(await sql("SELECT 1 FROM devices WHERE user_id = $1", [gone.userId])).toHaveLength(0);
        expect(goneClock.state.alarm).toBeNull();
    });

    it("alerts a deadline at 09:00 on its day, and a deferral again at its new time", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await sql("INSERT INTO tasks (user_id, title, order_index, due_on, created_at) VALUES ($1, 'Tax', 1, '2026-10-07', '2026-10-01T12:00:00Z')", [userId]);
        const calls = pushService();
        const { clock } = await replanAndFire(env, userId, NOW); // 11:00: the 09:00 alert is still owed today
        expect(count(calls, endpoint)).toBe(1);
        const [{ id: taskId }] = await sql("SELECT id FROM tasks WHERE user_id = $1", [userId]);
        await sql("INSERT INTO notification_state (user_id, object_type, object_id, trigger_id, deferred_until) VALUES ($1, 'task', $2, $3, '2026-10-07T20:00:00Z')",
            [userId, taskId, `task-due::${taskId}::2026-10-07`]);
        await clock.replan(userId, NOW); // the snooze is a write
        await clock.fire(new Date("2026-10-07T20:00:30Z"));
        expect(count(calls, endpoint)).toBe(2);
    });

    it("rebuilds itself when its plan runs out", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        const calls = pushService();
        const { clock, state } = clockFor(env);
        await clock.replan(userId, NOW);
        expect(state.alarm).toBe(later(36 * 3600_000).getTime());
        const end = new Date(state.alarm!);
        await remind(userId, "Made while the plan was out", end.toISOString());
        await clock.fire(end);
        await clock.fire(end);
        expect(count(calls, endpoint)).toBe(1);
    });
    it("backs off a rebuild that keeps failing, never sooner than 5 minutes, and resets once one succeeds", async () => {
        const env = await vapidEnv();
        const { clock, state, data } = clockFor(env);
        // An expired plan for an id Postgres rejects: every rebuild throws.
        await state.storage.put({ userId: "not-a-uuid", plan: { targets: [], entries: [], until: 0 } });
        const start = Date.now();
        await clock.alarm();
        expect(state.alarm).toBeGreaterThanOrEqual(start + 5 * 60_000);
        await clock.alarm();
        expect(state.alarm).toBeGreaterThanOrEqual(start + 15 * 60_000);
        expect(data.get("failures")).toBe(2);
        const { userId } = await subscriber(env);
        await clock.replan(userId, NOW);
        expect(data.has("failures")).toBe(false);
    });

    it("keeps a plan rebuilt while it was sending", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await remind(userId, "Now", "2026-10-07T14:59:00Z");
        await remind(userId, "Deleted", "2026-10-07T17:30:00Z");
        let release!: () => void;
        const held = new Promise<void>((resolve) => { release = resolve; });
        const calls: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); await held; return new Response(null, { status: 201 }); }));
        const { clock, plan } = clockFor(env);
        await clock.replan(userId, NOW);
        const firing = clock.fire(NOW);
        await vi.waitFor(() => expect(calls).toHaveLength(1));
        // A delete lands mid-send and rebuilds the clock.
        await sql("DELETE FROM tasks WHERE user_id = $1 AND title = 'Deleted'", [userId]);
        await clock.replan(userId, NOW);
        release();
        await firing;
        expect(plan().entries.some((entry) => entry.at === Date.parse("2026-10-07T17:30:00Z"))).toBe(false);
        await clock.fire(later(1000));
        expect(count(calls, endpoint)).toBe(1);
    });

    it("stays forgotten when the account is deleted mid-send", async () => {
        const env = await vapidEnv();
        const { userId } = await subscriber(env);
        await remind(userId, "Now", "2026-10-07T14:59:00Z");
        await remind(userId, "Later", "2026-10-07T17:30:00Z");
        let release!: () => void;
        const held = new Promise<void>((resolve) => { release = resolve; });
        const calls: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); await held; return new Response(null, { status: 201 }); }));
        const { clock, state, data } = clockFor(env);
        await clock.replan(userId, NOW);
        const firing = clock.fire(NOW);
        await vi.waitFor(() => expect(calls).toHaveLength(1));
        await clock.forget();
        release();
        await firing;
        expect(state.alarm).toBeNull();
        expect(data.size).toBe(0);
    });

    it("gives up on a delivery after three failed tries, and a gone device leaves the others sending", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        const other = await registerBrowser(env, userId, "Safari on iPhone");
        await remind(userId, "Call mum", "2026-10-07T14:59:00Z");
        const calls: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return new Response(null, { status: url === other.endpoint ? 410 : 503 }); }));
        const { clock, state } = clockFor(env);
        await clock.replan(userId, NOW);
        for (let minute = 0; minute < 4; minute++) await clock.fire(later(minute * 60_000));
        expect(count(calls, endpoint)).toBe(3);
        expect(count(calls, other.endpoint)).toBe(1);
        expect(state.alarm).toBe(later(36 * 3600_000).getTime()); // no retry left: only the plan's end
    });

    it("doesn't resend what the old minute cron already sent today", async () => {
        const env = await vapidEnv();
        const { userId, endpoint } = await subscriber(env);
        await sql("INSERT INTO tasks (user_id, title, order_index, due_on, created_at) VALUES ($1, 'Tax', 1, '2026-10-07', '2026-10-01T12:00:00Z')", [userId]);
        const [{ id: deviceId }] = await sql("SELECT id FROM devices WHERE user_id = $1", [userId]);
        const [{ id: taskId }] = await sql("SELECT id FROM tasks WHERE user_id = $1", [userId]);
        await sql("INSERT INTO push_deliveries (user_id, device_id, occurrence_key, status, lease_until) VALUES ($1, $2, $3, 'sent', now())", [userId, deviceId, `task-due::${taskId}::2026-10-07`]);
        const calls = pushService();
        await replanAndFire(env, userId, NOW);
        expect(count(calls, endpoint)).toBe(0);
    });

    it("forgets everything when the account is deleted", async () => {
        const env = await vapidEnv();
        const { userId } = await subscriber(env);
        await remind(userId, "Call mum", "2026-10-07T17:00:00Z");
        const { clock, state, data } = clockFor(env);
        await clock.replan(userId, NOW);
        await clock.forget();
        expect(state.alarm).toBeNull();
        expect(data.size).toBe(0);
        // The deletion request's own replan (or any late write) runs after the account is gone: it keeps nothing either.
        await sql("DELETE FROM users WHERE id = $1", [userId]);
        await clock.replan(userId, NOW);
        expect(state.alarm).toBeNull();
        expect(data.size).toBe(0);
    });

    it("keeps every outcome when a settle fails: failures add up and gone sticks", () => {
        const older = { a: { failures: 2 }, b: { failures: 0, gone: true }, c: { failures: 1 } };
        const newer = { a: { failures: 1 }, b: { lastSuccessAt: "2026-10-07T15:00:00Z", failures: 0 }, c: { lastSuccessAt: "2026-10-07T15:00:00Z", failures: 0 } };
        expect(mergeOutcomes(older, newer)).toEqual({
            a: { failures: 3, gone: undefined },
            b: { lastSuccessAt: "2026-10-07T15:00:00Z", failures: 0, gone: true },
            c: { lastSuccessAt: "2026-10-07T15:00:00Z", failures: 0, gone: undefined },
        });
    });
});

describe("what rebuilds a clock", () => {
    it("rebuilds a person's clock after their successful writes, not reads, failures, chat or usage events", async () => {
        const replanned: string[] = [];
        const pending: Promise<unknown>[] = [];
        const app = new Hono()
            .use("*", async (c, next) => { c.set("userId" as never, "someone" as never); await next(); })
            .use("/api/v1/*", replanAfterWrites as never)
            .all("/api/v1/*", (c) => c.json({}, c.req.path.endsWith("/bad") ? 422 : 200));
        const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {}, props: {} };
        const requests = [["POST", "/tasks"], ["DELETE", "/tasks/1"], ["GET", "/tasks"], ["POST", "/tasks/bad"], ["POST", "/events"], ["POST", "/ai/chat"]];
        for (const [method, path] of requests) await app.request(`/api/v1${path}`, { method }, { REMINDER_CLOCK: clockNamespace(replanned) }, ctx as never);
        await Promise.all(pending);
        expect(replanned).toEqual(["someone", "someone"]);
    });

    it("rebuilds the old owner's clock when someone else's browser takes over their endpoint", async () => {
        const env = await vapidEnv();
        const owner = await subscriber(env);
        const replanned: string[] = [];
        const taker = await createUser();
        const body = { installId: crypto.randomUUID(), kind: "computer", label: "Chrome", subscription: { endpoint: owner.endpoint, keys: await keys() } };
        expect((await api(taker, { ...env, REMINDER_CLOCK: clockNamespace(replanned) })("PUT", "/devices", body)).status).toBe(200);
        expect(replanned).toEqual([owner.userId]);
    });
});
