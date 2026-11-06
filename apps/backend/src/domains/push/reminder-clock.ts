/**
 * `ReminderClock`: one Durable Object per person that sends their reminders on time without asking Postgres.
 * Postgres stays the truth; the clock holds only a derived plan (`plan.ts`), rebuilt whenever that person
 * writes (Neon is awake then anyway) and by itself when the plan runs out. Its one alarm is the next alert:
 * `setAlarm` overwrites, so an edit or delete simply replaces the plan and the old alert is gone.
 *
 * It also holds the person's live-sync WebSockets (hibernated, so idle sockets cost nothing). After every write it
 * sends each one `{ v }`, a counter that carries no content: the client refetches when `v` changed, which replaces polling.
 */
import { DurableObject } from "cloudflare:workers";
import type { MiddlewareHandler } from "hono";
import { LATE_ALERT_MS } from "@cadence/domain/reminders";
import { getDbClient } from "../../platform/db";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { sendWebPush, vapidConfigured } from "./web-push";
import { deliveryKey, legacySent, loadReminderPlan, mergeOutcomes, recordOutcome, settleOutcomes, type DeviceOutcome, type ReminderPlan } from "./plan";
import { verifyAppToken, type AuthVariables } from "../../platform/auth";
import { AppError } from "../../platform/errors";
import type { Env } from "../../types/env";

/** Sent keys are kept this long: longer than any alert can stay due, so nothing goes out twice. */
const SENT_RETENTION_MS = 3 * 24 * 3600_000;
/** A failed send is retried this soon, at most {@link MAX_ATTEMPTS} times while the alert is still timely. Sending never touches Postgres. */
const RETRY_MS = 60_000;
const MAX_ATTEMPTS = 3;
/** After a failed alarm (a rebuild that can't reach or read Postgres), wait this long, longer each time in a row; never sooner than 5 minutes. */
const FAILURE_BACKOFF_MS = [5, 15, 60, 240].map((minutes) => minutes * 60_000);

const deviceOf = (delivery: string) => delivery.slice(delivery.lastIndexOf("|") + 1);
const entryOf = (delivery: string) => delivery.slice(0, delivery.lastIndexOf("|"));
const timely = (entry: { at: number }, now: number) => entry.at <= now && now - entry.at <= LATE_ALERT_MS;

/** The live socket's path, its subprotocol, and the close codes the client acts on (see `use-live-sync.ts`). */
export const LIVE_PATH = "/api/v1/live";
const LIVE_PROTOCOL = "cadence.live";
/** One open copy of Cadence: sent on its requests (`X-Cadence-Origin`) and its socket, so its own writes don't make it refetch. */
export const ORIGIN_HEADER = "X-Cadence-Origin";
const originOf = (value: string | null | undefined) => (value && /^[\w-]{1,64}$/.test(value) ? value : undefined);
const offeredProtocols = (request: Request) => (request.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((part) => part.trim());
const CLOSE = { badToken: 4401, rateLimited: 4429, accountGone: 4001, error: 1011 } as const;

/**
 * A reconnect ticket (`t.<userId>.<secret>`), handed out on a socket opened with a JWT and kept only in that page's memory.
 * Reconnecting with it asks nothing of Neon Auth (no token fetch, no key-set read), whose reads wake the database.
 * It opens nothing but this content-free socket; account deletion drops every ticket.
 */
const TICKET_TTL_MS = 7 * 24 * 3600_000;
const MAX_TICKETS = 20;
const ticketOf = (token: string) => /^t\.([0-9a-f-]{36})\.([0-9a-f]{32})$/.exec(token);
/** Set by `connectLive` only (any copy the client sent is overwritten): who the socket is for, and how they proved it. */
const LIVE_USER_HEADER = "X-Live-User";
const LIVE_AUTH_HEADER = "X-Live-Auth";

/** A browser sees no HTTP status on a failed handshake, so a refusal is an accepted socket closed at once with a 4xxx code. */
function refuse(code: number, reason: string) {
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    server.close(code, reason);
    return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": LIVE_PROTOCOL } });
}

export class ReminderClock extends DurableObject<Env> {
    private dirty = false;
    private building: Promise<void> | null = null;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        // Answered without waking the object, so a 45 s keep-alive costs nothing while hibernated.
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }

    /**
     * A live-sync socket, routed here by `connectLive`. A JWT was verified there and earns a reconnect ticket; a ticket
     * is checked here. The socket gets the current version (and its ticket) and then every ping.
     */
    override async fetch(request: Request): Promise<Response> {
        const [, token, origin] = offeredProtocols(request);
        const now = Date.now();
        const stored = (await this.ctx.storage.get<Record<string, number>>("tickets")) ?? {};
        const tickets = Object.fromEntries(Object.entries(stored).filter(([, until]) => until > now));
        let ticket: string | undefined;
        if (request.headers.get(LIVE_AUTH_HEADER) === "jwt") {
            const secret = [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
            tickets[secret] = now + TICKET_TTL_MS;
            ticket = `t.${request.headers.get(LIVE_USER_HEADER)}.${secret}`;
        } else if (!tickets[ticketOf(token ?? "")?.[2] ?? ""]) {
            return refuse(CLOSE.badToken, "sign in again");
        }
        // The newest few only: one per open copy of Cadence is all that's ever in use.
        await this.ctx.storage.put("tickets", Object.fromEntries(Object.entries(tickets).sort(([, a], [, b]) => b - a).slice(0, MAX_TICKETS)));

        const { 0: client, 1: server } = new WebSocketPair();
        const tag = originOf(origin);
        this.ctx.acceptWebSocket(server, tag ? [tag] : []);
        server.send(JSON.stringify({ v: (await this.ctx.storage.get<number>("liveVersion")) ?? 0, ...(ticket && { ticket }) }));
        return new Response(null, { status: 101, webSocket: client, headers: { "Sec-WebSocket-Protocol": LIVE_PROTOCOL } });
    }

    override webSocketMessage() {}
    override webSocketError() {}
    // compatibility_date predates web_socket_auto_reply_to_close, so finish the close ourselves.
    override webSocketClose(ws: WebSocket, code: number) {
        try { ws.close(code === 1005 || code === 1006 ? 1000 : code); } catch { /* already closed */ }
    }

    /**
     * Tell every open socket that something changed, except the copy of Cadence that made the change (`origin`):
     * it already shows it. Always bumps, so a reconnect can see what it missed.
     */
    async ping(origin?: string) {
        const v = ((await this.ctx.storage.get<number>("liveVersion")) ?? 0) + 1;
        await this.ctx.storage.put("liveVersion", v);
        for (const ws of this.ctx.getWebSockets()) {
            if (origin && this.ctx.getTags(ws).includes(origin)) continue;
            try { ws.send(JSON.stringify({ v })); } catch { /* closing */ }
        }
    }

    /**
     * Rebuild the plan from Postgres. Calls arriving mid-build coalesce into one more build, so the last
     * plan always reflects the last write. A failed rebuild marks the plan stale and retries on the alarm's backoff,
     * so an edit or delete is never left to a 7-day-old plan. `quiet` skips the ping (nothing another device shows
     * changed); `origin` is the copy of Cadence that wrote. `now` is for tests.
     */
    async replan(userId: string, now?: Date, live: { origin?: string; quiet?: boolean } = {}): Promise<void> {
        await this.ctx.storage.put("userId", userId);
        // The write has committed: other devices needn't wait for (or depend on) VAPID or Neon.
        if (!live.quiet) await this.ping(live.origin);
        this.dirty = true;
        this.building ??= (async () => {
            try {
                while (this.dirty) {
                    this.dirty = false;
                    await this.rebuild(userId, now ?? new Date());
                }
            } catch (err) {
                await this.ctx.storage.put("stale", true);
                await this.retryLater(err);
            } finally {
                this.building = null;
            }
        })();
        return this.building;
    }

    /** The account is gone: sockets closed, no alarm, nothing kept. */
    async forget(): Promise<void> {
        for (const ws of this.ctx.getWebSockets()) {
            try { ws.close(CLOSE.accountGone, "account deleted"); } catch { /* closing */ }
        }
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
    }

    async alarm(): Promise<void> {
        try {
            await this.fire(new Date());
        } catch (err) {
            await this.retryLater(err);
        }
    }

    /**
     * Re-arm ourselves (a throwing alarm is retried only a few times, and the clock must never stop silently),
     * backing off so a rebuild that keeps failing can't keep Postgres awake.
     */
    private async retryLater(err: unknown) {
        const failures = ((await this.ctx.storage.get<number>("failures")) ?? 0) + 1;
        await this.ctx.storage.put("failures", failures);
        logger.error("cron", "reminder_clock_failed", { failures, issues: issuesFromError(err) });
        await this.ctx.storage.setAlarm(Date.now() + FAILURE_BACKOFF_MS[Math.min(failures, FAILURE_BACKOFF_MS.length) - 1]);
    }

    private async rebuild(userId: string, now: Date) {
        // Without VAPID keys nothing can be pushed, so there is no plan worth keeping (the live version and sockets stay).
        if (!vapidConfigured(this.env)) return this.standDown();
        const db = getDbClient(this.env);
        try {
            // Taken before settling, so a send that lands during the settle starts a fresh record instead of being lost.
            const outcomes = (await this.ctx.storage.get<Record<string, DeviceOutcome>>("outcomes")) ?? {};
            await this.ctx.storage.delete("outcomes");
            try {
                await settleOutcomes(db, userId, outcomes);
            } catch (err) {
                const newer = (await this.ctx.storage.get<Record<string, DeviceOutcome>>("outcomes")) ?? {};
                await this.ctx.storage.put("outcomes", mergeOutcomes(outcomes, newer));
                throw err;
            }
            if ((await this.ctx.storage.get("sent")) === undefined) {
                const seeded = await legacySent(db, userId, now);
                await this.ctx.storage.put("sent", { ...seeded, ...(await this.ctx.storage.get<Record<string, number>>("sent")) });
            }
            const plan = await loadReminderPlan(db, userId, now);
            // Deleted accounts keep nothing, whichever rebuild (a late write, the deletion's own request) gets here last.
            if (!plan) return await this.forget();
            await this.ctx.storage.put("plan", plan);
            await this.ctx.storage.delete(["failures", "stale"]);
            await this.arm(plan, now.getTime());
        } finally {
            // A Durable Object outlives the request, so close the connection rather than leave it idle.
            await db.$client.end?.({ timeout: 1 }).catch(() => {});
        }
    }

    /** No plan: nothing to send, and no account id kept (the live version is only a counter). */
    private async standDown() {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.delete(["userId", "plan", "sent", "tries", "outcomes", "failures", "stale"]);
    }

    /** The next alarm: now for an unsent due alert, soon for a retry, else the next alert or the plan's end (to rebuild); none without a device. */
    private async arm(plan: ReminderPlan, now: number) {
        if (plan.targets.length === 0) return this.ctx.storage.deleteAlarm();
        const sent = (await this.ctx.storage.get<Record<string, number>>("sent")) ?? {};
        const tries = (await this.ctx.storage.get<Record<string, number>>("tries")) ?? {};
        const unsent = (key: string) => plan.targets.some((target) => !sent[deliveryKey(key, target.id)] && !tries[deliveryKey(key, target.id)]);
        if (plan.entries.some((entry) => timely(entry, now) && unsent(entry.key))) return this.ctx.storage.setAlarm(now);
        const retry = Object.keys(tries).length > 0 ? now + RETRY_MS : Infinity;
        const next = plan.entries.reduce((min, entry) => (entry.at > now ? Math.min(min, entry.at) : min), retry);
        await this.ctx.storage.setAlarm(Math.min(next, plan.until));
    }

    /** Send what is due (each delivery once), keep what failed for a retry, and re-arm. `now` is injectable for tests. */
    async fire(now: Date): Promise<void> {
        const plan = await this.ctx.storage.get<ReminderPlan>("plan");
        const userId = await this.ctx.storage.get<string>("userId");
        if (!userId) return;
        const at = now.getTime();
        // Ran out, or the last rebuild failed (the plan may still hold an edited or deleted reminder): rebuild first.
        if (!plan || at >= plan.until || (await this.ctx.storage.get("stale"))) return this.replan(userId, now, { quiet: true });

        const alreadySent = (await this.ctx.storage.get<Record<string, number>>("sent")) ?? {};
        // ponytail: an alarm that runs later than LATE_ALERT_MS (an outage) drops what it missed, like the app's own rule.
        const due = plan.entries.filter((entry) => timely(entry, at));
        const results = await Promise.all(due.flatMap((entry) => plan.targets
            .filter((target) => !alreadySent[deliveryKey(entry.key, target.id)])
            .map(async (target) => ({ key: deliveryKey(entry.key, target.id), deviceId: target.id, outcome: await sendWebPush(this.env, target, entry.message) }))));

        // The sends let other calls in (a replan may have stored a fresh plan), so merge into what is stored now.
        // Storage calls only from here to the put: nothing can interleave.
        const fresh = await this.ctx.storage.get<ReminderPlan>("plan");
        if (!fresh) return; // forgotten mid-send (the account was deleted): bring nothing back
        const sent = (await this.ctx.storage.get<Record<string, number>>("sent")) ?? {};
        const tries = (await this.ctx.storage.get<Record<string, number>>("tries")) ?? {};
        const outcomes = (await this.ctx.storage.get<Record<string, DeviceOutcome>>("outcomes")) ?? {};
        const gone = new Set<string>();
        for (const { key, deviceId, outcome } of results) {
            recordOutcome(outcomes, deviceId, outcome, now);
            if (outcome === "accepted") {
                sent[key] = at;
                delete tries[key];
            } else if (outcome === "gone") {
                gone.add(deviceId);
            } else if ((tries[key] = (tries[key] ?? 0) + 1) >= MAX_ATTEMPTS) {
                delete tries[key];
                sent[key] = at; // given up: never retried again
            }
        }
        for (const [key, when] of Object.entries(sent)) if (at - when > SENT_RETENTION_MS) delete sent[key];
        const next = { ...fresh, targets: fresh.targets.filter((target) => !gone.has(target.id)), entries: fresh.entries.filter((entry) => at - entry.at <= LATE_ALERT_MS) };
        // A retry only lasts while its alert is timely and its device is still a target.
        const retryable = new Set(next.entries.filter((entry) => timely(entry, at)).map((entry) => entry.key));
        const targetIds = new Set(next.targets.map((target) => target.id));
        for (const key of Object.keys(tries)) if (!retryable.has(entryOf(key)) || !targetIds.has(deviceOf(key))) delete tries[key];

        await this.ctx.storage.put({ plan: next, sent, tries, outcomes });
        if (due.length > 0) logger.info("cron", "reminder_clock_sent", { userHash: await hashIdentifier(userId), due: due.length, gone: gone.size });
        await this.arm(next, at);
    }
}

/**
 * Ask a person's clock to rebuild (and ping their open devices). Best-effort and never throws: the clock rebuilds itself when its plan runs out.
 * Call it after a write has committed, inside `waitUntil`.
 */
export async function replanReminders(env: Env, userId: string, live?: { origin?: string; quiet?: boolean }): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).replan(userId, undefined, live);
    } catch (err) {
        logger.warn("cron", "reminder_replan_failed", { userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
    }
}

/** A write made outside a request (a background suggestion): the person's other devices refetch, every one of them. No replan. */
export async function pingLive(env: Env, userId: string): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).ping();
    } catch (err) {
        logger.warn("cron", "live_ping_failed", { userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
    }
}

/**
 * After a committed write, the person's clock rebuilds (Neon is awake for the write anyway) and their other devices
 * hear of it. Chat replans when its stream ends; assistant memory writes count (the mode lives in settings); usage
 * events and searches never change a reminder.
 */
export const replanAfterWrites: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
    await next();
    if (c.req.method === "GET" || c.req.method === "OPTIONS" || c.res.status >= 300) return;
    const path = c.req.path;
    if (path.startsWith("/api/v1/ai/") && !path.startsWith("/api/v1/ai/memory/")) return;
    if (["/api/v1/events", "/api/v1/search"].some((prefix) => path.startsWith(prefix))) return;
    // A device saying hello changes who gets reminders (replan) but nothing another device shows (no ping).
    const quiet = c.req.method === "PUT" && path === "/api/v1/push/devices";
    c.executionCtx.waitUntil(replanReminders(c.env, c.get("userId"), { origin: originOf(c.req.header(ORIGIN_HEADER)), quiet }));
};

/** Account deletion: stop the clock and drop what it holds. Never throws: if it fails, the replan after the request finds no account and forgets. */
export async function forgetReminders(env: Env, userId: string): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).forget();
    } catch (err) {
        logger.warn("cron", "reminder_forget_failed", { userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
    }
}

/**
 * `GET /api/v1/live` (WebSocket). Dispatched before the Hono app: a browser can't send `Authorization` on a WebSocket,
 * so the JWT (or a reconnect ticket, checked by the person's clock) rides in `Sec-WebSocket-Protocol: cadence.live, <token>`.
 */
export async function connectLive(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const [protocol, token] = offeredProtocols(request);
    if (protocol !== LIVE_PROTOCOL || !token) return new Response("Bad protocol", { status: 400 });

    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" })).success) return refuse(CLOSE.rateLimited, "slow down");
    const ticket = ticketOf(token);
    let userId: string;
    if (ticket) {
        userId = ticket[1];
    } else {
        try {
            ({ userId } = await verifyAppToken(env, token));
        } catch (err) {
            return err instanceof AppError && err.statusCode === 401 ? refuse(CLOSE.badToken, "sign in again") : refuse(CLOSE.error, "unavailable");
        }
    }
    if (env.RATE_LIMITER_READ && !(await env.RATE_LIMITER_READ.limit({ key: userId })).success) return refuse(CLOSE.rateLimited, "slow down");
    if (!env.REMINDER_CLOCK) return refuse(CLOSE.error, "unavailable");
    const headers = new Headers(request.headers);
    headers.set(LIVE_USER_HEADER, userId);
    headers.set(LIVE_AUTH_HEADER, ticket ? "ticket" : "jwt");
    return env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).fetch(new Request(request, { headers }));
}
