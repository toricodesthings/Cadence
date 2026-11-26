import { WS_CLOSE } from "@cadence/contracts/live";
import { DurableObject } from "cloudflare:workers";
import type { MiddlewareHandler } from "hono";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { LIVE_MAX_BYTES, LIVE_MAX_CHANGES, type LiveChange } from "@cadence/contracts/live";
import { LATE_ALERT_MS } from "@cadence/domain/reminders";
import { taskTags } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { shapeFor } from "../../platform/list-access";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { sendWebPush, vapidConfigured } from "./web-push";
import {
    deliveryKey,
    legacySent,
    loadReminderPlan,
    mergeOutcomes,
    recordOutcome,
    settleOutcomes,
    type DeviceOutcome,
    type ReminderPlan,
} from "./plan";
import { verifyAppToken, type AuthVariables } from "../../platform/auth";
import { AppError } from "../../platform/errors";
import { offeredProtocols, refuseWs } from "../../platform/ws-auth";
import type { Env } from "../../types/env";

const SENT_RETENTION_MS = 3 * 24 * 3600_000;
const RETRY_MS = 60_000;
const MAX_ATTEMPTS = 3;
const FAILURE_BACKOFF_MS = [5, 15, 60, 240].map((minutes) => minutes * 60_000);

const deviceOf = (delivery: string) => delivery.slice(delivery.lastIndexOf("|") + 1);
const entryOf = (delivery: string) => delivery.slice(0, delivery.lastIndexOf("|"));
const timely = (entry: { at: number }, now: number) => entry.at <= now && now - entry.at <= LATE_ALERT_MS;

export const LIVE_PATH = "/api/v1/live";
const LIVE_PROTOCOL = "cadence.live";
export const ORIGIN_HEADER = "X-Cadence-Origin";
const originOf = (value: string | null | undefined) => (value && /^[\w-]{1,64}$/.test(value) ? value : undefined);

const TICKET_TTL_MS = 7 * 24 * 3600_000;
const MAX_TICKETS = 20;
const ticketOf = (token: string) => /^t\.([0-9a-f-]{36})\.([0-9a-f]{32})$/.exec(token);
const LIVE_USER_HEADER = "X-Live-User";
const LIVE_AUTH_HEADER = "X-Live-Auth";

type LiveOptions = { origin?: string; quiet?: boolean; changes?: LiveChange[] };

export class ReminderClock extends DurableObject<Env> {
    private dirty = false;
    private building: Promise<void> | null = null;

    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }

    override async fetch(request: Request): Promise<Response> {
        const [, token, origin] = offeredProtocols(request);
        const now = Date.now();
        const stored = (await this.ctx.storage.get<Record<string, number>>("tickets")) ?? {};
        const tickets = Object.fromEntries(Object.entries(stored).filter(([, until]) => until > now));
        let ticket: string | undefined;
        if (request.headers.get(LIVE_AUTH_HEADER) === "jwt") {
            const secret = [...crypto.getRandomValues(new Uint8Array(16))]
                .map((byte) => byte.toString(16).padStart(2, "0"))
                .join("");
            tickets[secret] = now + TICKET_TTL_MS;
            ticket = `t.${request.headers.get(LIVE_USER_HEADER)}.${secret}`;
        } else if (!tickets[ticketOf(token ?? "")?.[2] ?? ""]) {
            return refuseWs(LIVE_PROTOCOL, WS_CLOSE.badToken, "sign in again");
        }
        await this.ctx.storage.put(
            "tickets",
            Object.fromEntries(
                Object.entries(tickets)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, MAX_TICKETS),
            ),
        );

        const { 0: client, 1: server } = new WebSocketPair();
        const tag = originOf(origin);
        this.ctx.acceptWebSocket(server, tag ? [tag] : []);
        server.send(
            JSON.stringify({ v: (await this.ctx.storage.get<number>("liveVersion")) ?? 0, ...(ticket && { ticket }) }),
        );
        return new Response(null, {
            status: 101,
            webSocket: client,
            headers: { "Sec-WebSocket-Protocol": LIVE_PROTOCOL },
        });
    }

    override webSocketMessage() {}
    override webSocketError() {}
    override webSocketClose(ws: WebSocket, code: number) {
        try {
            ws.close(code === 1005 || code === 1006 ? 1000 : code);
        } catch {}
    }

    async ping(origin?: string, changes?: LiveChange[]) {
        const v = ((await this.ctx.storage.get<number>("liveVersion")) ?? 0) + 1;
        await this.ctx.storage.put("liveVersion", v);
        const withRows = changes?.length && changes.length <= LIVE_MAX_CHANGES ? JSON.stringify({ v, changes }) : null;
        const message =
            withRows && new TextEncoder().encode(withRows).length <= LIVE_MAX_BYTES ? withRows : JSON.stringify({ v });
        for (const ws of this.ctx.getWebSockets()) {
            if (origin && this.ctx.getTags(ws).includes(origin)) continue;
            try {
                ws.send(message);
            } catch {}
        }
    }

    async replan(userId: string, now?: Date, live: LiveOptions = {}): Promise<void> {
        await this.ctx.storage.put("userId", userId);
        if (!live.quiet) await this.ping(live.origin, live.changes);
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

    async forget(): Promise<void> {
        for (const ws of this.ctx.getWebSockets()) {
            try {
                ws.close(WS_CLOSE.accountGone, "account deleted");
            } catch {}
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

    private async retryLater(err: unknown) {
        const failures = ((await this.ctx.storage.get<number>("failures")) ?? 0) + 1;
        await this.ctx.storage.put("failures", failures);
        logger.error("cron", "reminder_clock_failed", { failures, issues: issuesFromError(err) });
        await this.ctx.storage.setAlarm(
            Date.now() + FAILURE_BACKOFF_MS[Math.min(failures, FAILURE_BACKOFF_MS.length) - 1],
        );
    }

    private async rebuild(userId: string, now: Date) {
        if (!vapidConfigured(this.env)) return this.standDown();
        const db = getDbClient(this.env);
        try {
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
                await this.ctx.storage.put("sent", {
                    ...seeded,
                    ...(await this.ctx.storage.get<Record<string, number>>("sent")),
                });
            }
            const plan = await loadReminderPlan(db, userId, now);
            if (!plan) return await this.forget();
            await this.ctx.storage.put("plan", plan);
            await this.ctx.storage.delete(["failures", "stale"]);
            await this.arm(plan, now.getTime());
        } finally {
            await db.$client.end?.({ timeout: 1 }).catch(() => {});
        }
    }

    private async standDown() {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.delete(["userId", "plan", "sent", "tries", "outcomes", "failures", "stale"]);
    }

    private async arm(plan: ReminderPlan, now: number) {
        if (plan.targets.length === 0) return this.ctx.storage.deleteAlarm();
        const sent = (await this.ctx.storage.get<Record<string, number>>("sent")) ?? {};
        const tries = (await this.ctx.storage.get<Record<string, number>>("tries")) ?? {};
        const unsent = (key: string) =>
            plan.targets.some((target) => !sent[deliveryKey(key, target.id)] && !tries[deliveryKey(key, target.id)]);
        if (plan.entries.some((entry) => timely(entry, now) && unsent(entry.key)))
            return this.ctx.storage.setAlarm(now);
        const retry = Object.keys(tries).length > 0 ? now + RETRY_MS : Infinity;
        const next = plan.entries.reduce((min, entry) => (entry.at > now ? Math.min(min, entry.at) : min), retry);
        await this.ctx.storage.setAlarm(Math.min(next, plan.until));
    }

    async fire(now: Date): Promise<void> {
        const plan = await this.ctx.storage.get<ReminderPlan>("plan");
        const userId = await this.ctx.storage.get<string>("userId");
        if (!userId) return;
        const at = now.getTime();
        if (!plan || at >= plan.until || (await this.ctx.storage.get("stale")))
            return this.replan(userId, now, { quiet: true });

        const alreadySent = (await this.ctx.storage.get<Record<string, number>>("sent")) ?? {};
        const due = plan.entries.filter((entry) => timely(entry, at));
        const results = await Promise.all(
            due.flatMap((entry) =>
                plan.targets
                    .filter((target) => !alreadySent[deliveryKey(entry.key, target.id)])
                    .map(async (target) => ({
                        key: deliveryKey(entry.key, target.id),
                        deviceId: target.id,
                        outcome: await sendWebPush(this.env, target, entry.message),
                    })),
            ),
        );

        const fresh = await this.ctx.storage.get<ReminderPlan>("plan");
        if (!fresh) return;
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
                sent[key] = at;
            }
        }
        for (const [key, when] of Object.entries(sent)) if (at - when > SENT_RETENTION_MS) delete sent[key];
        const next = {
            ...fresh,
            targets: fresh.targets.filter((target) => !gone.has(target.id)),
            entries: fresh.entries.filter((entry) => at - entry.at <= LATE_ALERT_MS),
        };
        const retryable = new Set(next.entries.filter((entry) => timely(entry, at)).map((entry) => entry.key));
        const targetIds = new Set(next.targets.map((target) => target.id));
        for (const key of Object.keys(tries))
            if (!retryable.has(entryOf(key)) || !targetIds.has(deviceOf(key))) delete tries[key];

        await this.ctx.storage.put({ plan: next, sent, tries, outcomes });
        if (due.length > 0)
            logger.info("cron", "reminder_clock_sent", {
                userHash: await hashIdentifier(userId),
                due: due.length,
                gone: gone.size,
            });
        await this.arm(next, at);
    }
}

export async function replanReminders(env: Env, userId: string, live?: LiveOptions): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).replan(userId, undefined, live);
    } catch (err) {
        logger.warn("cron", "reminder_replan_failed", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(err),
        });
    }
}

export async function pingLive(
    env: Env,
    userId: string,
    live: Pick<LiveOptions, "origin" | "changes"> = {},
): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).ping(live.origin, live.changes);
    } catch (err) {
        logger.warn("cron", "live_ping_failed", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(err),
        });
    }
}

export const replanAfterWrites: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
    await next();
    if (c.req.method === "GET" || c.req.method === "OPTIONS" || c.res.status >= 300) return;
    const path = c.req.path;
    if (path.startsWith("/api/v1/ai/") && !path.startsWith("/api/v1/ai/memory/")) return;
    if (["/api/v1/events", "/api/v1/search", "/api/v1/account/delete"].some((prefix) => path.startsWith(prefix)))
        return;
    const quiet = c.req.method === "PUT" && path === "/api/v1/push/devices";
    const callerId = c.get("userId");
    const origin = originOf(c.req.header(ORIGIN_HEADER));
    const changes = c.get("liveChanges") ?? [];
    c.executionCtx.waitUntil(
        replanReminders(c.env, callerId, {
            origin,
            quiet,
            ...(changes.length > 0 && { changes: changes.map((change) => shapeFor(change, callerId)) }),
        }),
    );
    const others = (c.get("liveAudience") ?? []).filter((id) => id !== callerId);
    if (others.length) {
        const db = getDbClient(c.env);
        c.executionCtx.waitUntil(Promise.all(others.map((id) => tellPerson(c.env, id, callerId, origin, changes, db))));
    }
};

async function tellPerson(
    env: Env,
    id: string,
    _writerId: string,
    origin: string | undefined,
    changes: LiveChange[],
    db?: ReturnType<typeof getDbClient>,
) {
    const replan = changes.some(
        (change) =>
            (change.type === "task" && change.task.userId === id) ||
            change.type === "event" ||
            change.type === "routine",
    );
    const shaped = await withRecipientTags(env, id, changes, db);
    if (replan) return replanReminders(env, id, { origin, changes: shaped });
    return pingLive(env, id, { origin, changes: shaped });
}

export async function broadcastLive(
    env: Env,
    callerId: string,
    audience: string[],
    changes: LiveChange[],
    origin?: string,
): Promise<void> {
    const callerChanges = changes.length > 0 ? changes.map((change) => shapeFor(change, callerId)) : undefined;
    const others = [...new Set(audience)].filter((id) => id !== callerId);
    const db = others.length > 0 ? getDbClient(env) : undefined;
    await Promise.all([
        replanReminders(env, callerId, { origin, ...(callerChanges && { changes: callerChanges }) }),
        ...others.map((id) => tellPerson(env, id, callerId, origin, changes, db)),
    ]);
}

async function withRecipientTags(
    env: Env,
    recipientId: string,
    changes: LiveChange[],
    db?: ReturnType<typeof getDbClient>,
): Promise<LiveChange[]> {
    const base = changes.map((change) => shapeFor(change, recipientId));
    const taskIds = base.flatMap((change) => (change.type === "task" ? [change.task.id] : []));
    if (!taskIds.length) return base;
    try {
        const links = await withRls(db ?? getDbClient(env), recipientId, (tx) =>
            tx
                .select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
                .from(taskTags)
                .where(inArray(taskTags.taskId, taskIds)),
        );
        return base.map((change) =>
            change.type === "task"
                ? {
                      ...change,
                      task: {
                          ...change.task,
                          tagIds: links.filter((link) => link.taskId === change.task.id).map((link) => link.tagId),
                      },
                  }
                : change,
        );
    } catch {
        return [];
    }
}

export async function forgetReminders(env: Env, userId: string): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).forget();
    } catch (err) {
        logger.warn("cron", "reminder_forget_failed", {
            userHash: await hashIdentifier(userId),
            issues: issuesFromError(err),
        });
    }
}

export async function connectLive(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
        return new Response("Expected a WebSocket", { status: 426 });
    const [protocol, token] = offeredProtocols(request);
    if (protocol !== LIVE_PROTOCOL || !token) return new Response("Bad protocol", { status: 400 });

    const ip = request.headers.get("cf-connecting-ip") || "unknown";
    if (env.RATE_LIMITER && !(await env.RATE_LIMITER.limit({ key: ip })).success)
        return refuseWs(LIVE_PROTOCOL, WS_CLOSE.rateLimited, "slow down");
    const ticket = ticketOf(token);
    let userId: string;
    if (ticket) {
        if (!z.uuid().safeParse(ticket[1]).success) return refuseWs(LIVE_PROTOCOL, WS_CLOSE.badToken, "sign in again");
        userId = ticket[1];
    } else {
        try {
            ({ userId } = await verifyAppToken(env, token));
        } catch (err) {
            return err instanceof AppError && err.statusCode === 401
                ? refuseWs(LIVE_PROTOCOL, WS_CLOSE.badToken, "sign in again")
                : refuseWs(LIVE_PROTOCOL, WS_CLOSE.error, "unavailable");
        }
    }
    if (env.RATE_LIMITER_READ && !(await env.RATE_LIMITER_READ.limit({ key: ticket ? `live:${ip}` : userId })).success)
        return refuseWs(LIVE_PROTOCOL, WS_CLOSE.rateLimited, "slow down");
    if (!env.REMINDER_CLOCK) return refuseWs(LIVE_PROTOCOL, WS_CLOSE.error, "unavailable");
    const headers = new Headers(request.headers);
    headers.set(LIVE_USER_HEADER, userId);
    headers.set(LIVE_AUTH_HEADER, ticket ? "ticket" : "jwt");
    return env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).fetch(new Request(request, { headers }));
}
