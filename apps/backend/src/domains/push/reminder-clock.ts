/**
 * `ReminderClock`: one Durable Object per person that sends their reminders on time without asking Postgres.
 * Postgres stays the truth; the clock holds only a derived plan (`plan.ts`), rebuilt whenever that person
 * writes (Neon is awake then anyway), on their 04:00 pass, and by itself when the plan runs out. Its one alarm
 * is the next alert: `setAlarm` overwrites, so an edit or delete simply replaces the plan and the old alert is gone.
 */
import { DurableObject } from "cloudflare:workers";
import type { MiddlewareHandler } from "hono";
import { LATE_ALERT_MS } from "@cadence/domain/reminders";
import { getDbClient } from "../../platform/db";
import { rememberZone } from "../../platform/zone-mirror";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { sendWebPush, vapidConfigured } from "./web-push";
import { deliveryKey, legacySent, loadReminderPlan, mergeOutcomes, recordOutcome, settleOutcomes, type DeviceOutcome, type ReminderPlan } from "./plan";
import type { AuthVariables } from "../../platform/auth";
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

export class ReminderClock extends DurableObject<Env> {
    private dirty = false;
    private building: Promise<void> | null = null;

    /**
     * Rebuild the plan from Postgres. Calls arriving mid-build coalesce into one more build, so the last
     * plan always reflects the last write. `now` is for tests.
     */
    async replan(userId: string, now?: Date): Promise<void> {
        await this.ctx.storage.put("userId", userId);
        this.dirty = true;
        this.building ??= (async () => {
            try {
                while (this.dirty) {
                    this.dirty = false;
                    await this.rebuild(userId, now ?? new Date());
                }
            } finally {
                this.building = null;
            }
        })();
        return this.building;
    }

    /** The account is gone: no alarm, nothing kept. */
    async forget(): Promise<void> {
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
    }

    async alarm(): Promise<void> {
        try {
            await this.fire(new Date());
        } catch (err) {
            // Re-arm ourselves (a throwing alarm is retried only a few times, and the clock must never stop silently),
            // backing off so a rebuild that keeps failing can't keep Postgres awake.
            const failures = ((await this.ctx.storage.get<number>("failures")) ?? 0) + 1;
            await this.ctx.storage.put("failures", failures);
            logger.error("cron", "reminder_clock_failed", { failures, issues: issuesFromError(err) });
            await this.ctx.storage.setAlarm(Date.now() + FAILURE_BACKOFF_MS[Math.min(failures, FAILURE_BACKOFF_MS.length) - 1]);
        }
    }

    private async rebuild(userId: string, now: Date) {
        // Without VAPID keys nothing can be pushed, so there is nothing worth keeping.
        if (!vapidConfigured(this.env)) return this.forget();
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
            await this.ctx.storage.delete("failures");
            if (plan.zone) await rememberZone(this.env, plan.zone).catch(() => {});
            await this.arm(plan, now.getTime());
        } finally {
            // A Durable Object outlives the request, so close the connection rather than leave it idle.
            await db.$client.end?.({ timeout: 1 }).catch(() => {});
        }
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
        if (!plan || !userId) return;
        const at = now.getTime();
        if (at >= plan.until) return this.replan(userId, now);

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
 * Ask a person's clock to rebuild. Best-effort and never throws: the 04:00 pass rebuilds every clock daily.
 * Call it after a write has committed, inside `waitUntil`.
 */
export async function replanReminders(env: Env, userId: string): Promise<void> {
    if (!env.REMINDER_CLOCK) return;
    try {
        await env.REMINDER_CLOCK.get(env.REMINDER_CLOCK.idFromName(userId)).replan(userId);
    } catch (err) {
        logger.warn("cron", "reminder_replan_failed", { userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
    }
}

/**
 * After a committed write, the person's clock rebuilds (Neon is awake for the write anyway). Chat replans when
 * its stream ends; usage events never change a reminder.
 */
export const replanAfterWrites: MiddlewareHandler<{ Bindings: Env; Variables: AuthVariables }> = async (c, next) => {
    await next();
    if (c.req.method === "GET" || c.req.method === "OPTIONS" || c.res.status >= 300) return;
    if (c.req.path.startsWith("/api/v1/ai/") || c.req.path.startsWith("/api/v1/events")) return;
    c.executionCtx.waitUntil(replanReminders(c.env, c.get("userId")));
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
