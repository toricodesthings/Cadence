import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { formatInZone, todayIn } from "@cadence/domain/time";
import { deriveReminders, dueAlert, reminderKindEnabled, type ReminderHabit, type ReminderTask } from "@cadence/domain/reminders";
import { getDbClient, type DbClient } from "../../platform/db";
import { withRls } from "../../platform/rls";
import { userZone } from "../../platform/user-zone";
import { logger, hashIdentifier, issuesFromError } from "../../platform/log";
import { devices, habitLogs, habits, notificationState, pushDeliveries, tasks, users } from "../../db/schema";
import { normalizeSettings } from "../settings/settings.route";
import { sendWebPush, vapidConfigured, type PushMessage, type PushOutcome } from "./web-push";
import type { Env } from "../../types/env";

const LEASE_MS = 2 * 60_000;
const MAX_ATTEMPTS = 3;
/** A device that has failed this many sends in a row is dropped. */
const MAX_FAILURES = 10;
export const PUSH_DELIVERY_RETENTION_DAYS = 3;

/** Where a tap goes: the reminder's route, with the same focus params the in-app list adds. */
function openUrl(reminder: { route: string | null; entityId: string | null; kind: string }): string | null {
    if (!reminder.route) return null;
    if (!reminder.entityId || reminder.kind === "personal-event") return reminder.route;
    const focus = new URLSearchParams({ focusKind: reminder.kind === "habit-reminder" ? "habit" : "task", focusId: reminder.entityId, focusSource: "notification" });
    return `${reminder.route}?${focus}`;
}

interface Claim {
    deliveryId: string;
    device: { id: string; endpoint: string; p256dh: string; auth: string };
    message: PushMessage;
}

/** Everything a user's due reminders need, read in one transaction; claims them so a re-run (or overlapping run) can't send twice. */
async function claimDueReminders(db: DbClient, userId: string, now: Date): Promise<Claim[]> {
    return withRls(db, userId, async (tx) => {
        const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
        const settings = normalizeSettings(row?.settings ?? {});
        const prefs = settings.notifications;
        // The account's browser/desktop notification switch still gates every device while devices are per-browser.
        if (!prefs.browser) return [];

        // Only devices the server can reach, and only the ones still switched on here.
        const targets = await tx
            .select({ id: devices.id, endpoint: devices.endpoint, p256dh: devices.p256dh, auth: devices.auth })
            .from(devices)
            .where(and(eq(devices.userId, userId), eq(devices.enabled, true), isNotNull(devices.endpoint)));
        if (targets.length === 0) return [];

        const zone = await userZone(tx, userId);
        const today = todayIn(zone, now);
        const from = new Date(now.getTime() - 24 * 3600_000).toISOString();
        const to = new Date(now.getTime() + 3600_000).toISOString();
        const open = and(eq(tasks.userId, userId), inArray(tasks.state, ["ACTIVE", "WAITING"]));
        const taskRows: ReminderTask[] = await tx
            .select({
                id: tasks.id, title: tasks.title, state: tasks.state, projectId: tasks.projectId, dueDate: tasks.dueDate,
                reminderAt: tasks.reminderAt, reminderSilenced: tasks.reminderSilenced, waitingOn: tasks.waitingOn,
                waitingReminder: tasks.waitingReminder, createdAt: tasks.createdAt,
            })
            .from(tasks)
            .where(and(open, or(
                sql`${tasks.reminderAt} BETWEEN ${from}::timestamptz AND ${to}::timestamptz`,
                sql`${tasks.waitingReminder} BETWEEN ${from}::timestamptz AND ${to}::timestamptz`,
                eq(tasks.dueDate, today),
            )));

        const habitRows = await tx
            .select({
                id: habits.id, title: habits.title, archived: habits.archived, reminderEnabled: habits.reminderEnabled,
                targetTime: habits.targetTime, targetTimes: habits.targetTimes, targetDate: habitLogs.targetDate, status: habitLogs.status,
            })
            .from(habits)
            .innerJoin(habitLogs, eq(habitLogs.habitId, habits.id))
            .where(and(eq(habits.userId, userId), eq(habits.archived, false), eq(habits.reminderEnabled, true), eq(habitLogs.targetDate, today), eq(habitLogs.status, "PENDING")));
        const routines: ReminderHabit[] = habitRows.map(({ targetDate, status, ...habit }) => ({ ...habit, logs: [{ targetDate, status }] }));

        const personal = settings.calendar.personalEvents;
        const hour12 = settings.dateTime.timeDisplay !== "24h";
        const reminders = deriveReminders(
            { tasks: taskRows, habits: routines, personalEvents: personal.enabled ? personal.items : [] },
            now,
            zone,
            {
                time: (instant) => formatInZone(instant, zone, { hour: "numeric", minute: "2-digit", hour12 }),
                date: (day) => formatInZone(day, zone, { month: "short", day: "numeric" }),
            },
            prefs.habitReminderLeadMinutes,
        ).filter((reminder) => reminder.alertAt && reminderKindEnabled(reminder.kind, prefs));
        if (reminders.length === 0) return [];

        // Dismissal and deferral are keyed by the reminder id, the same rows the app reads.
        const states = await tx
            .select({ triggerId: notificationState.triggerId, dismissedAt: notificationState.dismissedAt, deferredUntil: notificationState.deferredUntil })
            .from(notificationState)
            .where(and(
                eq(notificationState.userId, userId),
                inArray(notificationState.triggerId, reminders.map((reminder) => reminder.id)),
                or(isNotNull(notificationState.dismissedAt), isNotNull(notificationState.deferredUntil)),
            ));
        const stateOf = new Map(states.map((state) => [state.triggerId, state]));

        const claims: Claim[] = [];
        for (const reminder of reminders) {
            const state = stateOf.get(reminder.id);
            const due = dueAlert(reminder, {
                now, zone,
                quietHours: { enabled: prefs.quietHoursEnabled, start: prefs.quietHoursStart, end: prefs.quietHoursEnd },
                dismissed: !!state?.dismissedAt,
                deferredUntil: state?.deferredUntil,
            });
            if (!due) continue;
            for (const device of targets) {
                const [claimed] = await tx
                    .insert(pushDeliveries)
                    .values({ userId, deviceId: device.id, occurrenceKey: due.key, leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() })
                    .onConflictDoUpdate({
                        target: [pushDeliveries.deviceId, pushDeliveries.occurrenceKey],
                        set: { attempts: sql`${pushDeliveries.attempts} + 1`, leaseUntil: new Date(now.getTime() + LEASE_MS).toISOString() },
                        // Only an expired, unfinished claim is retried; a sent one never is.
                        setWhere: and(eq(pushDeliveries.status, "pending"), lt(pushDeliveries.leaseUntil, now.toISOString()), lt(pushDeliveries.attempts, MAX_ATTEMPTS)),
                    })
                    .returning({ id: pushDeliveries.id });
                if (claimed) claims.push({ deliveryId: claimed.id, device: device as Claim["device"], message: { title: reminder.title, body: reminder.body, route: openUrl(reminder), tag: due.key } });
            }
        }
        return claims;
    });
}

async function settle(db: DbClient, userId: string, results: Array<{ claim: Claim; outcome: PushOutcome }>, now: Date) {
    await withRls(db, userId, async (tx) => {
        for (const { claim, outcome } of results) {
            const id = claim.device.id;
            if (outcome === "accepted") {
                await tx.update(pushDeliveries).set({ status: "sent" }).where(eq(pushDeliveries.id, claim.deliveryId));
                await tx.update(devices).set({ lastSuccessAt: now.toISOString(), failureCount: 0 }).where(eq(devices.id, id));
            } else if (outcome === "gone") {
                await tx.delete(devices).where(eq(devices.id, id)); // cascades its claims
            } else {
                // Release the claim for the next run (attempts bound the retries).
                await tx.update(pushDeliveries).set({ leaseUntil: now.toISOString() }).where(eq(pushDeliveries.id, claim.deliveryId));
                await tx.update(devices).set({ failureCount: sql`${devices.failureCount} + 1` }).where(eq(devices.id, id));
            }
        }
        await tx.delete(devices).where(and(eq(devices.userId, userId), sql`${devices.failureCount} >= ${MAX_FAILURES}`));
    });
}

/**
 * Every minute: send each user's due reminders to their registered devices. No transaction is
 * open while the push services are called. Web Push is best-effort: `accepted` means the push
 * service has it, not that a banner was shown.
 * ponytail: one pass per user per minute; shard users across runs if the device count makes this slow.
 */
export async function runPushDispatch(env: Env, now: Date = new Date()) {
    if (!vapidConfigured(env)) return { users: 0, sent: 0, failed: 0 };
    const db = getDbClient(env);
    const userIds = (await db.select({ id: sql<string>`u.id` }).from(sql`push_user_ids() AS u(id)`)).map((row) => row.id);
    let sent = 0;
    let failed = 0;
    for (const userId of userIds) {
        try {
            const claims = await claimDueReminders(db, userId, now);
            if (claims.length === 0) continue;
            const results = await Promise.all(claims.map(async (claim) => ({ claim, outcome: await sendWebPush(env, claim.device, claim.message) })));
            await settle(db, userId, results, now);
            for (const { outcome } of results) {
                if (outcome === "accepted") sent++;
                else failed++;
            }
        } catch (err) {
            logger.error("cron", "push_dispatch_failed", { userHash: await hashIdentifier(userId), issues: issuesFromError(err) });
        }
    }
    return { users: userIds.length, sent, failed };
}

/** Claims only matter while a reminder can still go out; the daily prune drops them. */
export async function prunePushDeliveries(env: Env, now: Date = new Date()) {
    const cutoff = new Date(now.getTime() - PUSH_DELIVERY_RETENTION_DAYS * 24 * 3600_000).toISOString();
    const db = getDbClient(env);
    const userIds = (await db.select({ id: sql<string>`u.id` }).from(sql`push_user_ids() AS u(id)`)).map((row) => row.id);
    let total = 0;
    for (const userId of userIds) {
        total += (await withRls(db, userId, (tx) => tx.delete(pushDeliveries).where(and(eq(pushDeliveries.userId, userId), lt(pushDeliveries.createdAt, cutoff))).returning({ id: pushDeliveries.id }))).length;
    }
    return total;
}
