/**
 * A person's reminder plan: every OS alert due in the next {@link PLAN_HORIZON_MS}, worked out ahead from
 * Postgres while it is awake, so the `ReminderClock` can send each one at its second without asking again.
 * The plan is derived and disposable: any write rebuilds it. The rulebook (`deriveReminders`, `dueAlert`) is
 * the same one the app uses; this only asks it at the instants where its answer can change.
 */
import { and, between, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { addDays, atLocal, formatInZone, todayIn, type Zone } from "@cadence/domain/time";
import { deriveReminders, dueAlert, reminderKindEnabled, type Reminder, type ReminderHabit, type ReminderTask } from "@cadence/domain/reminders";
import { habitDays } from "@cadence/domain/repeats";
import type { PersonalEvent, SettingsView } from "@cadence/contracts/settings";
import { withRls } from "../../platform/rls";
import { userZone } from "../../platform/user-zone";
import { devices, habitLogs, habits, notificationState, pushDeliveries, tasks, users } from "../../db/schema";
import { normalizeSettings } from "../settings/settings.route";
import type { PushMessage, PushOutcome } from "./web-push";
import type { DbClient } from "../../platform/db";

/** How far ahead a plan reaches. The 04:00 pass rebuilds it daily; the clock rebuilds itself when it runs out. */
export const PLAN_HORIZON_MS = 36 * 3600_000;
/** A device that has failed this many sends in a row is dropped. */
const MAX_FAILURES = 10;
const HOUR = 3600_000;

export interface PushTarget { id: string; endpoint: string; p256dh: string; auth: string }
export interface PlanEntry { at: number; key: string; message: PushMessage }
export interface ReminderPlan { targets: PushTarget[]; entries: PlanEntry[]; until: number; zone?: Zone }

/** Where a tap goes: the reminder's route, with the same focus params the in-app list adds. */
function openUrl(reminder: Reminder): string | null {
    if (!reminder.route) return null;
    if (!reminder.entityId || reminder.kind === "personal-event") return reminder.route;
    const focus = new URLSearchParams({ focusKind: reminder.kind === "habit-reminder" ? "habit" : "task", focusId: reminder.entityId, focusSource: "notification" });
    return `${reminder.route}?${focus}`;
}

type HabitRow = Omit<ReminderHabit, "logs"> & { recurrenceRule: string; createdAt: string; pausedUntil: string | null };
type Log = NonNullable<ReminderHabit["logs"]>[number];
type AlertState = { dismissedAt: string | null; deferredUntil: string | null };

export interface PlanInput {
    zone: Zone;
    prefs: SettingsView["notifications"];
    hour12: boolean;
    tasks: ReminderTask[];
    habits: HabitRow[];
    /** habitId → day → that day's log. */
    logs: Map<string, Map<string, Log>>;
    personalEvents: PersonalEvent[];
}

/** The rulebook's answer at `t`: OS-alerting reminders of switched-on kinds, with routines due on t's day. */
function reminderDeriver(input: PlanInput) {
    const { zone, prefs } = input;
    const routinesByDay = new Map<string, ReminderHabit[]>();
    const routinesOn = (day: string) => {
        let routines = routinesByDay.get(day);
        if (!routines) {
            routines = input.habits.flatMap(({ recurrenceRule, createdAt, pausedUntil, ...habit }) => {
                if (habitDays({ recurrenceRule, createdAt, pausedUntil }, new Map(), day, day, zone, day).length === 0) return [];
                // An untouched day has no log yet: every time is still open.
                const log = input.logs.get(habit.id)?.get(day) ?? { targetDate: day, status: "PENDING", timeMarks: null };
                return [{ ...habit, logs: [log] }];
            });
            routinesByDay.set(day, routines);
        }
        return routines;
    };
    const fmt = {
        time: (instant: string) => formatInZone(instant, zone, { hour: "numeric", minute: "2-digit", hour12: input.hour12 }),
        date: (day: string) => formatInZone(day, zone, { month: "short", day: "numeric" }),
    };
    return (t: number): Reminder[] => {
        const now = new Date(t);
        return deriveReminders({ tasks: input.tasks, habits: routinesOn(todayIn(zone, now)), personalEvents: input.personalEvents }, now, zone, fmt, prefs)
            .filter((reminder) => reminder.alertAt && reminderKindEnabled(reminder.kind, prefs));
    };
}

/** Every reminder the rulebook shows at some point in [now, until]: its windows reach an hour ahead, so hourly samples see them all. */
export function sampleReminders(input: PlanInput, now: number, until: number): Reminder[] {
    const derive = reminderDeriver(input);
    const seen = new Map<string, Reminder>();
    for (let t = now; t <= until + HOUR; t += HOUR) for (const reminder of derive(t)) seen.set(reminder.id, reminder);
    return [...seen.values()];
}

/**
 * The alerts to send between now and until. `dueAlert` can only turn true at an alert's own instant, a
 * deferral, or the end of quiet hours or a pause, so it is asked exactly there (and now, for anything still
 * owed). Each occurrence key is planned once, at the first instant it is due.
 * ponytail: one derivation per candidate instant (a few dozen a day); index reminders by instant if plans get slow.
 */
export function planAlerts(input: PlanInput, sampled: Reminder[], states: Map<string, AlertState>, now: number, until: number): PlanEntry[] {
    const { zone, prefs } = input;
    const instants = new Set<number>([now]);
    for (const reminder of sampled) {
        instants.add(Date.parse(reminder.alertAt!));
        const deferred = states.get(reminder.id)?.deferredUntil;
        if (deferred) instants.add(Date.parse(deferred));
    }
    if (prefs.pausedUntil) instants.add(Date.parse(prefs.pausedUntil));
    if (prefs.quietHoursEnabled && prefs.quietHoursEnd) {
        const last = todayIn(zone, new Date(until));
        for (let day = addDays(todayIn(zone, new Date(now)), -1); day <= last; day = addDays(day, 1)) instants.add(Date.parse(atLocal(day, prefs.quietHoursEnd, zone)));
    }

    const derive = reminderDeriver(input);
    const quietHours = { enabled: prefs.quietHoursEnabled, start: prefs.quietHoursStart, end: prefs.quietHoursEnd };
    const planned = new Set<string>();
    const entries: PlanEntry[] = [];
    for (const t of [...instants].filter((ms) => ms >= now && ms <= until).sort((a, b) => a - b)) {
        for (const reminder of derive(t)) {
            const state = states.get(reminder.id);
            const due = dueAlert(reminder, { now: new Date(t), zone, quietHours, pausedUntil: prefs.pausedUntil, dismissed: !!state?.dismissedAt, deferredUntil: state?.deferredUntil });
            if (!due || planned.has(due.key)) continue;
            planned.add(due.key);
            entries.push({ at: t, key: due.key, message: { title: reminder.title, body: reminder.body, route: openUrl(reminder), tag: due.key } });
        }
    }
    return entries;
}

/** Reads everything the next {@link PLAN_HORIZON_MS} of alerts depends on, in one RLS transaction, and plans them. Null: the account is gone. */
export async function loadReminderPlan(db: DbClient, userId: string, now: Date): Promise<ReminderPlan | null> {
    const until = now.getTime() + PLAN_HORIZON_MS;
    return withRls(db, userId, async (tx) => {
        const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
        if (!row) return null;
        const settings = normalizeSettings(row.settings ?? {});
        const prefs = settings.notifications;
        const zone = await userZone(tx, userId);
        // The account's browser/desktop notification switch still gates every device while devices are per-browser.
        if (!prefs.browser) return { targets: [], entries: [], until, zone };

        // Only devices the server can reach, and only the ones still switched on here.
        const targets = (await tx
            .select({ id: devices.id, endpoint: devices.endpoint, p256dh: devices.p256dh, auth: devices.auth })
            .from(devices)
            .where(and(eq(devices.userId, userId), eq(devices.enabled, true), isNotNull(devices.endpoint)))) as PushTarget[];
        if (targets.length === 0) return { targets, entries: [], until, zone };

        const today = todayIn(zone, now);
        const lastDay = todayIn(zone, new Date(until));
        const iso = (ms: number) => new Date(ms).toISOString();
        const from = iso(now.getTime() - 24 * HOUR);
        const to = iso(until + HOUR);
        const ahead = prefs.dueHeadsUpDays;
        const taskRows: ReminderTask[] = await tx
            .select({
                id: tasks.id, title: tasks.title, state: tasks.state, projectId: tasks.projectId, dueDate: tasks.dueDate,
                reminderAt: tasks.reminderAt, reminderSilenced: tasks.reminderSilenced, waitingOn: tasks.waitingOn,
                waitingReminder: tasks.waitingReminder, createdAt: tasks.createdAt,
                scheduledStart: tasks.scheduledStart, scheduledEnd: tasks.scheduledEnd,
                recurrenceRule: tasks.recurrenceRule, interactionMode: tasks.interactionMode,
            })
            .from(tasks)
            .where(and(eq(tasks.userId, userId), inArray(tasks.state, ["ACTIVE", "WAITING"]), or(
                sql`${tasks.reminderAt} BETWEEN ${from}::timestamptz AND ${to}::timestamptz`,
                sql`${tasks.waitingReminder} BETWEEN ${from}::timestamptz AND ${to}::timestamptz`,
                // A deadline alerts only on its own day; the heads-up `ahead` days before.
                between(tasks.dueDate, today, lastDay),
                ...(ahead ? [between(tasks.dueDate, addDays(today, ahead), addDays(lastDay, ahead))] : []),
                // Timed blocks: one-offs starting in the window (longest lead 2 h), and every repeating series (expanded in the rulebook).
                sql`${tasks.scheduledStart} BETWEEN ${from}::timestamptz AND ${iso(until + 4 * HOUR)}::timestamptz`,
                and(isNotNull(tasks.recurrenceRule), isNotNull(tasks.scheduledStart)),
            )));

        // Every reminding routine, and the logs already made for the plan's days.
        const habitRows: HabitRow[] = await tx
            .select({
                id: habits.id, title: habits.title, archived: habits.archived, reminderEnabled: habits.reminderEnabled,
                targetTime: habits.targetTime, targetTimes: habits.targetTimes, times: habits.times,
                recurrenceRule: habits.recurrenceRule, createdAt: habits.createdAt, pausedUntil: habits.pausedUntil,
            })
            .from(habits)
            .where(and(eq(habits.userId, userId), eq(habits.archived, false), eq(habits.reminderEnabled, true)));
        const logs = new Map<string, Map<string, Log>>();
        if (habitRows.length > 0) {
            const logRows = await tx
                .select({ habitId: habitLogs.habitId, targetDate: habitLogs.targetDate, status: habitLogs.status, timeMarks: habitLogs.timeMarks })
                .from(habitLogs)
                .where(and(eq(habitLogs.userId, userId), inArray(habitLogs.habitId, habitRows.map((h) => h.id)), between(habitLogs.targetDate, today, lastDay)));
            for (const { habitId, ...log } of logRows) {
                if (!logs.has(habitId)) logs.set(habitId, new Map());
                logs.get(habitId)!.set(log.targetDate, log);
            }
        }

        const personal = settings.calendar.personalEvents;
        const input: PlanInput = {
            zone, prefs, hour12: settings.dateTime.timeDisplay !== "24h",
            tasks: taskRows, habits: habitRows, logs, personalEvents: personal.enabled ? personal.items : [],
        };
        const sampled = sampleReminders(input, now.getTime(), until);
        if (sampled.length === 0) return { targets, entries: [], until, zone };

        // Dismissal and deferral are keyed by the reminder id, the same rows the app reads.
        const states = await tx
            .select({ triggerId: notificationState.triggerId, dismissedAt: notificationState.dismissedAt, deferredUntil: notificationState.deferredUntil })
            .from(notificationState)
            .where(and(
                eq(notificationState.userId, userId),
                inArray(notificationState.triggerId, sampled.map((reminder) => reminder.id)),
                or(isNotNull(notificationState.dismissedAt), isNotNull(notificationState.deferredUntil)),
            ));
        const stateOf = new Map(states.map(({ triggerId, ...state }) => [triggerId, state]));
        return { targets, entries: planAlerts(input, sampled, stateOf, now.getTime(), until), until, zone };
    });
}

/** What the clock learned about a device since the last rebuild: written back while Neon is awake for it anyway. */
export interface DeviceOutcome { lastSuccessAt?: string; failures: number; gone?: boolean }

export function recordOutcome(outcomes: Record<string, DeviceOutcome>, deviceId: string, outcome: PushOutcome, at: Date) {
    const seen = outcomes[deviceId] ?? { failures: 0 };
    if (outcome === "accepted") outcomes[deviceId] = { lastSuccessAt: at.toISOString(), failures: 0 };
    else if (outcome === "gone") outcomes[deviceId] = { ...seen, gone: true };
    else outcomes[deviceId] = { ...seen, failures: seen.failures + 1 };
}

/** Outcomes kept back after a failed settle, joined with ones recorded since: failures add up, `gone` sticks, the newer success wins. */
export function mergeOutcomes(older: Record<string, DeviceOutcome>, newer: Record<string, DeviceOutcome>): Record<string, DeviceOutcome> {
    const merged = { ...older };
    for (const [id, next] of Object.entries(newer)) {
        const prev = merged[id];
        merged[id] = prev && !next.lastSuccessAt
            ? { lastSuccessAt: prev.lastSuccessAt, failures: prev.failures + next.failures, gone: prev.gone || next.gone }
            : { ...next, gone: prev?.gone || next.gone };
    }
    return merged;
}

/** 404/410 drops a device, a success resets its failure count, and repeated failures drop it too. */
export async function settleOutcomes(db: DbClient, userId: string, outcomes: Record<string, DeviceOutcome>) {
    const entries = Object.entries(outcomes);
    if (entries.length === 0) return;
    await withRls(db, userId, async (tx) => {
        for (const [id, outcome] of entries) {
            const mine = and(eq(devices.id, id), eq(devices.userId, userId));
            if (outcome.gone) await tx.delete(devices).where(mine);
            else if (outcome.lastSuccessAt) await tx.update(devices).set({ lastSuccessAt: outcome.lastSuccessAt, failureCount: outcome.failures }).where(mine);
            else await tx.update(devices).set({ failureCount: sql`${devices.failureCount} + ${outcome.failures}` }).where(mine);
        }
        await tx.delete(devices).where(and(eq(devices.userId, userId), sql`${devices.failureCount} >= ${MAX_FAILURES}`));
    });
}

/** One delivery: an occurrence on one device. */
export const deliveryKey = (key: string, deviceId: string) => `${key}|${deviceId}`;

/**
 * A clock's first build: what the old minute cron already claimed in the last day, so a deadline alert it sent
 * this morning isn't sent again. Goes with the `push_deliveries` table.
 */
export async function legacySent(db: DbClient, userId: string, now: Date): Promise<Record<string, number>> {
    const rows = await withRls(db, userId, (tx) => tx
        .select({ key: pushDeliveries.occurrenceKey, deviceId: pushDeliveries.deviceId })
        .from(pushDeliveries)
        .where(and(eq(pushDeliveries.userId, userId), gt(pushDeliveries.createdAt, new Date(now.getTime() - 24 * 3600_000).toISOString()))));
    return Object.fromEntries(rows.map((row) => [deliveryKey(row.key, row.deviceId), now.getTime()]));
}
