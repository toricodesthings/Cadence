import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import type { PersonalEvent } from "@cadence/contracts/settings";
import { routineTimeOn } from "./repeats";
import { atLocal, daysBetween, dayOf, todayIn, wallTimeOf, type Instant, type LocalDate, type WallTime, type Zone } from "./time";

export type ReminderKind =
    | "task-reminder"
    | "task-due"
    | "habit-reminder"
    | "waiting-followup"
    | "personal-event"
    | "system";

export interface Reminder {
    /** Stable occurrence id, e.g. "task-reminder::{taskId}::{reminderAt}". */
    id: string;
    kind: ReminderKind;
    title: string;
    body: string;
    /** Instant the reminder becomes relevant in the app. */
    triggerAt: Instant;
    /** Instant an OS alert is due (routine lead time, deadline alert time); null = never alerts the OS. */
    alertAt: Instant | null;
    entityId: string | null;
    route: string | null;
    priority: "normal" | "high";
}

/** Wording is injected so the app and the server say the same thing in the user's own formats. */
export interface ReminderFormat {
    time: (instant: Instant) => string;
    date: (day: LocalDate) => string;
}

export type ReminderTask = Pick<Task, "id" | "title" | "state" | "projectId" | "dueDate" | "reminderAt" | "reminderSilenced" | "waitingOn" | "waitingReminder"> & { createdAt?: Instant };
export type ReminderHabit = Pick<Habit, "id" | "title" | "archived" | "reminderEnabled" | "targetTime" | "targetTimes"> & { logs?: Array<{ targetDate: LocalDate; status: string }> };

export interface ReminderPrefs {
    taskReminders: boolean;
    habitReminders: boolean;
    dueDateAlerts: boolean;
    habitReminderLeadMinutes: number;
}

/** A deadline's OS alert, a wall time on its day. The deadline itself stays a LocalDate. */
export const DEADLINE_ALERT_TIME: WallTime = "09:00";
/** An OS alert still goes out this long after it was due (deadline alerts: until the day ends). */
export const LATE_ALERT_MS = 15 * 60_000;

const HOUR = 60 * 60_000;

/** The day a yearly event falls on this year. Feb 29 is observed on Feb 28 in common years. */
export function personalEventDay(monthDay: string, year: number): LocalDate {
    const [mm, dd] = monthDay.split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const day = mm === 2 && dd === 29 && !leap ? 28 : dd;
    return `${year}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const taskRoute = (task: Pick<ReminderTask, "projectId">) => (task.projectId ? `/project/${task.projectId}` : "/");

/** Handles midnight crossing (e.g. 22:00 → 07:00). */
export function isInQuietHours(now: Date, zone: Zone, enabled: boolean, start: WallTime | null, end: WallTime | null): boolean {
    if (!enabled || !start || !end) return false;
    const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
    const current = minutes(wallTimeOf(now, zone));
    const from = minutes(start);
    const to = minutes(end);
    return from <= to ? current >= from && current < to : current >= from || current < to;
}

/** Whether the user's reminder switches allow this kind at all. */
export function reminderKindEnabled(kind: ReminderKind, prefs: Pick<ReminderPrefs, "taskReminders" | "habitReminders" | "dueDateAlerts">): boolean {
    if (kind === "task-reminder" || kind === "waiting-followup") return prefs.taskReminders;
    if (kind === "task-due") return prefs.dueDateAlerts;
    if (kind === "habit-reminder") return prefs.habitReminders;
    return true;
}

/**
 * Raw reminders from current tasks, routines and yearly events. No preferences, no dismissal:
 * the app's list and the server's push scheduler both start here.
 */
export function deriveReminders(
    input: { tasks: ReminderTask[]; habits: ReminderHabit[]; personalEvents?: PersonalEvent[] },
    now: Date,
    zone: Zone,
    fmt: ReminderFormat,
    leadMinutes = 15,
): Reminder[] {
    const items: Reminder[] = [];
    const today = todayIn(zone, now);

    for (const task of input.tasks) {
        if (task.state === "COMPLETE" || task.state === "ARCHIVED") continue;

        // Explicit reminder
        if (task.reminderAt && !task.reminderSilenced) {
            const diffMs = Date.parse(task.reminderAt) - now.getTime();
            if (diffMs <= HOUR && diffMs > -24 * HOUR) {
                items.push({
                    id: `task-reminder::${task.id}::${task.reminderAt}`,
                    kind: "task-reminder",
                    title: task.title,
                    body: diffMs > 0 ? `Reminder at ${fmt.time(task.reminderAt)}` : `Reminder was at ${fmt.time(task.reminderAt)}`,
                    triggerAt: task.reminderAt,
                    alertAt: task.reminderAt,
                    entityId: task.id,
                    route: taskRoute(task),
                    priority: diffMs <= 0 ? "high" : "normal",
                });
            }
        }

        // Waiting follow-up: the check-in someone chose on a Waiting task. Only while it is
        // still waiting — completing or releasing it suppresses the nudge. One per check-in:
        // the id carries the instant, so a rescheduled check-in is a new candidate.
        if (task.state === "WAITING" && task.waitingOn && task.waitingReminder) {
            const diffMs = Date.parse(task.waitingReminder) - now.getTime();
            if (diffMs <= HOUR && diffMs > -24 * HOUR) {
                items.push({
                    id: `waiting-followup::${task.id}::${task.waitingReminder}`,
                    kind: "waiting-followup",
                    title: task.title,
                    body: diffMs > 0
                        ? `Follow up with ${task.waitingOn} at ${fmt.time(task.waitingReminder)}`
                        : `Time to follow up with ${task.waitingOn}`,
                    triggerAt: task.waitingReminder,
                    alertAt: task.waitingReminder,
                    entityId: task.id,
                    route: taskRoute(task),
                    priority: "normal",
                });
            }
        }

        // Deadlines: a deadline is a day (a LocalDate), never a time. The app lists it from the
        // start of the day; the OS alert is a separate wall time on that day, and never for a
        // task made after that moment (it would announce what the user just typed).
        if (task.dueDate) {
            const overdueDays = daysBetween(task.dueDate, today);
            if (overdueDays >= 0 && overdueDays <= 3) {
                const alertAt = atLocal(task.dueDate, DEADLINE_ALERT_TIME, zone);
                items.push({
                    id: `task-due::${task.id}::${task.dueDate}`,
                    kind: "task-due",
                    title: task.title,
                    body: overdueDays === 0 ? "Due today" : `Overdue since ${fmt.date(task.dueDate)}`,
                    triggerAt: atLocal(task.dueDate, "00:00", zone),
                    alertAt: task.createdAt && Date.parse(task.createdAt) > Date.parse(alertAt) ? null : alertAt,
                    entityId: task.id,
                    route: taskRoute(task),
                    priority: "high",
                });
            }
        }
    }

    for (const habit of input.habits) {
        if (habit.archived || !habit.reminderEnabled) continue;

        const targetTime = routineTimeOn(habit, today);
        if (!targetTime) continue;
        const target = atLocal(today, targetTime, zone);
        const diffMs = Date.parse(target) - now.getTime();
        if (Math.abs(diffMs) > 2 * HOUR) continue;

        // Today's log exists only when the routine is due and not paused; remind while it is still open.
        if (!habit.logs?.some((log) => log.targetDate === today && log.status === "PENDING")) continue;
        items.push({
            id: `habit-reminder::${habit.id}::${today}`,
            kind: "habit-reminder",
            title: habit.title,
            body: diffMs > 0 ? `Due at ${targetTime.slice(0, 5)}` : "Due now",
            triggerAt: target,
            alertAt: new Date(Date.parse(target) - leadMinutes * 60_000).toISOString(),
            entityId: habit.id,
            route: "/routines",
            priority: "normal",
        });
    }

    // Yearly personal events with their per-event bell on: one morning nudge on the day.
    // The id carries the year-day, so each year's occurrence is a fresh, stable candidate.
    for (const event of input.personalEvents ?? []) {
        if (!event.notify) continue;
        const day = personalEventDay(event.monthDay, Number(today.slice(0, 4)));
        if (day !== today) continue;
        const at = atLocal(day, "09:00", zone);
        items.push({
            id: `personal-event::${event.id}::${day}`,
            kind: "personal-event",
            title: event.label,
            body: "Today",
            triggerAt: at,
            alertAt: at,
            entityId: event.id,
            route: "/events",
            priority: "normal",
        });
    }

    return items;
}

export interface AlertGate {
    now: Date;
    zone: Zone;
    quietHours: { enabled: boolean; start: WallTime | null; end: WallTime | null };
    dismissed: boolean;
    deferredUntil?: Instant | null;
}

/**
 * The one OS-delivery policy for every transport. Returns the key and instant to send now, or
 * null: not due yet, too late, dismissed, or in quiet hours (quiet hours silence every OS alert,
 * high priority included; the app list still shows it). A deferral is a new delivery at its own
 * instant, so the key changes with it.
 */
export function dueAlert(reminder: Reminder, gate: AlertGate): { key: string; at: Instant } | null {
    if (!reminder.alertAt || gate.dismissed) return null;
    const deferred = gate.deferredUntil && Date.parse(gate.deferredUntil) > Date.parse(reminder.alertAt) ? gate.deferredUntil : null;
    const at = deferred ?? reminder.alertAt;
    const nowMs = gate.now.getTime();
    if (nowMs < Date.parse(at)) return null;
    const late = reminder.kind === "task-due" && !deferred
        ? dayOf(at, gate.zone) !== todayIn(gate.zone, gate.now)
        : nowMs - Date.parse(at) > LATE_ALERT_MS;
    if (late) return null;
    if (isInQuietHours(gate.now, gate.zone, gate.quietHours.enabled, gate.quietHours.start, gate.quietHours.end)) return null;
    return { key: deferred ? `${reminder.id}@${deferred}` : reminder.id, at };
}
