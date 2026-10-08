import type { Task } from "@cadence/contracts/task";
import type { Habit, TimeMarks } from "@cadence/contracts/habit";
import type { PersonalEvent } from "@cadence/contracts/settings";
import { routineTimesOn, timeMarksOn } from "./repeats";
import { addDays, atLocal, daysBetween, dayOf, expandSeries, todayIn, wallTimeOf, type Instant, type LocalDate, type WallTime, type Zone } from "./time";

export type ReminderKind =
    | "task-reminder"
    | "task-due"
    | "block-start"
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

export type ReminderTask = Pick<Task, "id" | "title" | "state" | "projectId" | "dueDate" | "reminderAt" | "reminderSilenced" | "waitingOn" | "waitingReminder"> & Partial<Pick<Task, "scheduledStart" | "scheduledEnd" | "recurrenceRule" | "interactionMode">> & { createdAt?: Instant };
export type ReminderHabit = Pick<Habit, "id" | "title" | "archived" | "reminderEnabled" | "targetTime" | "targetTimes"> & { times?: string[] | null; logs?: Array<{ targetDate: LocalDate; status: string; timeMarks?: TimeMarks | null }> };

export interface ReminderPrefs {
    taskReminders: boolean;
    habitReminders: boolean;
    dueDateAlerts: boolean;
    followUps: boolean;
    scheduleAlerts: boolean;
    habitReminderLeadMinutes: number;
    blockLeadMinutes: number;
    fixedLeadMinutes: number;
    dueHeadsUpDays: number;
    overdueDays: number;
    eventDaysBefore: number[];
    /** A deadline's or event's OS alert is a wall time on its day; the deadline itself stays a LocalDate. */
    morningTime: WallTime;
}

/** Must equal the settings defaults (a test holds them together). */
export const DEFAULT_REMINDER_PREFS: ReminderPrefs = {
    taskReminders: true, habitReminders: true, dueDateAlerts: true, followUps: true, scheduleAlerts: true,
    habitReminderLeadMinutes: 15, blockLeadMinutes: 10, fixedLeadMinutes: 30,
    dueHeadsUpDays: 0, overdueDays: 3, eventDaysBefore: [0], morningTime: "09:00",
};
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

export function isPaused(now: Date, pausedUntil: Instant | null | undefined): boolean {
    return !!pausedUntil && Date.parse(pausedUntil) > now.getTime();
}

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
export function reminderKindEnabled(kind: ReminderKind, prefs: Partial<Pick<ReminderPrefs, "taskReminders" | "habitReminders" | "dueDateAlerts" | "followUps" | "scheduleAlerts">>): boolean {
    const on = { ...DEFAULT_REMINDER_PREFS, ...prefs };
    if (kind === "task-reminder") return on.taskReminders;
    if (kind === "waiting-followup") return on.taskReminders && on.followUps;
    if (kind === "task-due") return on.dueDateAlerts;
    if (kind === "block-start") return on.scheduleAlerts;
    if (kind === "habit-reminder") return on.habitReminders;
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
    given: Partial<ReminderPrefs> = {},
): Reminder[] {
    const prefs = { ...DEFAULT_REMINDER_PREFS, ...given };
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
            const alertAt = atLocal(task.dueDate, prefs.morningTime, zone);
            const madeAfter = (at: Instant) => (task.createdAt && Date.parse(task.createdAt) > Date.parse(at) ? null : at);
            if (overdueDays >= 0 && overdueDays <= prefs.overdueDays) {
                items.push({
                    id: `task-due::${task.id}::${task.dueDate}`,
                    kind: "task-due",
                    title: task.title,
                    body: overdueDays === 0 ? "Due today" : `Overdue since ${fmt.date(task.dueDate)}`,
                    triggerAt: atLocal(task.dueDate, "00:00", zone),
                    alertAt: madeAfter(alertAt),
                    entityId: task.id,
                    route: taskRoute(task),
                    priority: "high",
                });
            }
            // The extra heads-up: its own occurrence, so it is dismissed on its own.
            if (prefs.dueHeadsUpDays > 0 && daysBetween(today, task.dueDate) === prefs.dueHeadsUpDays) {
                const headsUpAt = atLocal(today, prefs.morningTime, zone);
                items.push({
                    id: `task-due::${task.id}::${task.dueDate}::ahead`,
                    kind: "task-due",
                    title: task.title,
                    body: prefs.dueHeadsUpDays === 1 ? "Due tomorrow" : `Due ${fmt.date(task.dueDate)}`,
                    triggerAt: atLocal(today, "00:00", zone),
                    alertAt: madeAfter(headsUpAt),
                    entityId: task.id,
                    route: taskRoute(task),
                    priority: "normal",
                });
            }
        }

        // Timed blocks: one alert a lead before each start (a Fixed block gets its own lead).
        // An explicit reminder on the task wins, so the block never alerts twice.
        if (task.scheduledStart && !(task.reminderAt && !task.reminderSilenced)) {
            const lead = (task.interactionMode === "timetable" ? prefs.fixedLeadMinutes : prefs.blockLeadMinutes) * 60_000;
            const starts = task.recurrenceRule
                ? expandSeries({
                    rule: task.recurrenceRule,
                    start: { instant: task.scheduledStart, end: task.scheduledEnd ?? undefined },
                    zone,
                    range: { from: today, to: addDays(today, 1) },
                }).flatMap((occurrence) => (occurrence.start ? [occurrence.start] : []))
                : [task.scheduledStart];
            for (const start of starts) {
                const diffMs = Date.parse(start) - now.getTime();
                if (diffMs > lead + HOUR || diffMs <= -30 * 60_000) continue;
                items.push({
                    id: `block-start::${task.id}::${start}`,
                    kind: "block-start",
                    title: task.title,
                    body: diffMs > 0 ? `Starts at ${fmt.time(start)}` : "Started",
                    triggerAt: new Date(Date.parse(start) - lead).toISOString(),
                    alertAt: new Date(Date.parse(start) - lead).toISOString(),
                    entityId: task.id,
                    route: taskRoute(task),
                    priority: "normal",
                });
            }
        }
    }

    for (const habit of input.habits) {
        if (habit.archived || !habit.reminderEnabled) continue;

        // Today's log (when the routine is due and not paused, made or not): remind each time still open.
        const log = habit.logs?.find((entry) => entry.targetDate === today);
        if (!log) continue;
        const times = routineTimesOn(habit, today);
        const marks = timeMarksOn(times, log);
        for (const time of times) {
            if (habit.times?.length ? marks[time] : log.status !== "PENDING") continue;
            const target = atLocal(today, time, zone);
            const diffMs = Date.parse(target) - now.getTime();
            if (Math.abs(diffMs) > 2 * HOUR) continue;
            items.push({
                id: `habit-reminder::${habit.id}::${today}${habit.times?.length ? `::${time}` : ""}`,
                kind: "habit-reminder",
                title: habit.title,
                body: diffMs > 0 ? `Due at ${time.slice(0, 5)}` : "Due now",
                triggerAt: target,
                alertAt: new Date(Date.parse(target) - prefs.habitReminderLeadMinutes * 60_000).toISOString(),
                entityId: habit.id,
                route: "/routines",
                priority: "normal",
            });
        }
    }

    // Yearly personal events with their per-event bell on: a morning nudge on the day and on
    // each chosen day before. The id carries the event's year-day, so each year's occurrence is a
    // fresh, stable candidate (and a heads-up is its own, dismissed on its own).
    const year = Number(today.slice(0, 4));
    for (const event of input.personalEvents ?? []) {
        if (!event.notify) continue;
        for (const ahead of prefs.eventDaysBefore) {
            const day = [year, year + 1].map((y) => personalEventDay(event.monthDay, y)).find((d) => daysBetween(today, d) === ahead);
            if (!day) continue;
            const at = atLocal(today, prefs.morningTime, zone);
            items.push({
                id: `personal-event::${event.id}::${day}${ahead ? `::${ahead}d` : ""}`,
                kind: "personal-event",
                title: event.label,
                body: ahead === 0 ? "Today" : ahead === 1 ? "Tomorrow" : `In ${ahead} days`,
                triggerAt: at,
                alertAt: at,
                entityId: event.id,
                route: "/events",
                priority: "normal",
            });
        }
    }

    return items;
}

export interface AlertGate {
    now: Date;
    zone: Zone;
    quietHours: { enabled: boolean; start: WallTime | null; end: WallTime | null };
    /** Silences every alert, like quiet hours, until this instant. */
    pausedUntil?: Instant | null;
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
    if (isPaused(gate.now, gate.pausedUntil)) return null;
    if (isInQuietHours(gate.now, gate.zone, gate.quietHours.enabled, gate.quietHours.start, gate.quietHours.end)) return null;
    return { key: deferred ? `${reminder.id}@${deferred}` : reminder.id, at };
}
