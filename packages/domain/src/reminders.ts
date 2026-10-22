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
    /** An alert held by quiet hours or a pause still goes out until this instant: a block's start, else the end of the alert's day. */
    relevantUntil?: Instant | null;
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
    dueHeadsUpDays: 1, overdueDays: 3, eventDaysBefore: [0], morningTime: "09:00",
};
/** An OS alert still goes out this long after it was due (deadline alerts: until the day ends). */
export const LATE_ALERT_MS = 15 * 60_000;

const HOUR = 60 * 60_000;

/** Midnight that ends the local day an instant falls on. */
const endOfDay = (instant: Instant, zone: Zone): Instant => atLocal(addDays(dayOf(instant, zone), 1), "00:00", zone);

/** The day a yearly event falls on this year. Feb 29 is observed on Feb 28 in common years. */
export function personalEventDay(monthDay: string, year: number): LocalDate {
    const [mm, dd] = monthDay.split("-").map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const day = mm === 2 && dd === 29 && !leap ? 28 : dd;
    return `${year}-${String(mm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Where a tap lands: the task's list, else the view that shows its day (Capture only holds tasks with no day). */
function taskRoute(task: ReminderTask, today: LocalDate, zone: Zone): string {
    if (task.projectId) return `/project/${task.projectId}`;
    if (task.interactionMode === "timetable") return "/schedule";
    const day = task.dueDate ?? (task.scheduledStart ? dayOf(task.scheduledStart, zone) : null);
    if (!day) return "/";
    return day <= today ? "/today" : "/upcoming";
}

export function isPaused(now: Date, pausedUntil: Instant | null | undefined): boolean {
    return !!pausedUntil && Date.parse(pausedUntil) > now.getTime();
}

/** Handles midnight crossing (e.g. 22:00 → 07:00). */
export function isInQuietHours(now: Date, zone: Zone, enabled: boolean, start: WallTime | null, end: WallTime | null): boolean {
    if (!enabled || !start || !end) return false;
    return inWindow(minutesOf(wallTimeOf(now, zone)), minutesOf(start), minutesOf(end));
}

/** "22:30" → 1350. */
function minutesOf(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

/** Whether `current` falls in [from, to), wrapping past midnight when `to` is earlier. */
function inWindow(current: number, from: number, to: number): boolean {
    if (from <= to) return current >= from && current < to;
    return current >= from || current < to;
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

/** What every reminder source reads: the clock, the zone, the formats and the person's reminder settings. */
interface DeriveContext {
    now: Date;
    zone: Zone;
    fmt: ReminderFormat;
    prefs: ReminderPrefs;
    today: LocalDate;
}

/** Within the window a reminder shows in: from an hour ahead until a day after. */
const inReminderWindow = (diffMs: number) => diffMs <= HOUR && diffMs > -24 * HOUR;

/** The task's own reminder, unless silenced. */
function explicitReminder(task: ReminderTask, { now, zone, fmt, today }: DeriveContext): Reminder | null {
    if (!task.reminderAt || task.reminderSilenced) return null;
    const diffMs = Date.parse(task.reminderAt) - now.getTime();
    if (!inReminderWindow(diffMs)) return null;
    return {
        id: `task-reminder::${task.id}::${task.reminderAt}`,
        kind: "task-reminder",
        title: task.title,
        body: diffMs > 0 ? `Reminder at ${fmt.time(task.reminderAt)}` : `Reminder was at ${fmt.time(task.reminderAt)}`,
        triggerAt: task.reminderAt,
        alertAt: task.reminderAt,
        relevantUntil: endOfDay(task.reminderAt, zone),
        entityId: task.id,
        route: taskRoute(task, today, zone),
        priority: diffMs <= 0 ? "high" : "normal",
    };
}

/**
 * Waiting follow-up: the check-in someone chose on a Waiting task. Only while it is
 * still waiting — completing or releasing it suppresses the nudge. One per check-in:
 * the id carries the instant, so a rescheduled check-in is a new candidate.
 */
function waitingFollowUp(task: ReminderTask, { now, zone, fmt, today }: DeriveContext): Reminder | null {
    if (task.state !== "WAITING" || !task.waitingOn || !task.waitingReminder) return null;
    const diffMs = Date.parse(task.waitingReminder) - now.getTime();
    if (!inReminderWindow(diffMs)) return null;
    return {
        id: `waiting-followup::${task.id}::${task.waitingReminder}`,
        kind: "waiting-followup",
        title: task.title,
        body: diffMs > 0
            ? `Follow up with ${task.waitingOn} at ${fmt.time(task.waitingReminder)}`
            : `Time to follow up with ${task.waitingOn}`,
        triggerAt: task.waitingReminder,
        alertAt: task.waitingReminder,
        relevantUntil: endOfDay(task.waitingReminder, zone),
        entityId: task.id,
        route: taskRoute(task, today, zone),
        priority: "normal",
    };
}

/**
 * Deadlines: a deadline is a day (a LocalDate), never a time. The app lists it from the
 * start of the day; the OS alert is a separate wall time on that day, and never for a
 * task made after that moment (it would announce what the user just typed).
 */
function deadlineReminders(task: ReminderTask, ctx: DeriveContext): Reminder[] {
    if (!task.dueDate) return [];
    const { zone, fmt, prefs, today } = ctx;
    const dueDate = task.dueDate;
    const items: Reminder[] = [];
    const overdueDays = daysBetween(dueDate, today);
    const alertAt = atLocal(dueDate, prefs.morningTime, zone);
    const madeAfter = (at: Instant) => (task.createdAt && Date.parse(task.createdAt) > Date.parse(at) ? null : at);
    if (overdueDays >= 0 && overdueDays <= prefs.overdueDays) {
        items.push({
            id: `task-due::${task.id}::${dueDate}`,
            kind: "task-due",
            title: task.title,
            body: overdueDays === 0 ? "Due today" : `Overdue since ${fmt.date(dueDate)}`,
            triggerAt: atLocal(dueDate, "00:00", zone),
            alertAt: madeAfter(alertAt),
            relevantUntil: endOfDay(alertAt, zone),
            entityId: task.id,
            route: taskRoute(task, today, zone),
            priority: "high",
        });
    }
    // The extra heads-up: its own occurrence, so it is dismissed on its own.
    if (prefs.dueHeadsUpDays > 0 && daysBetween(today, dueDate) === prefs.dueHeadsUpDays) {
        const headsUpAt = atLocal(today, prefs.morningTime, zone);
        items.push({
            id: `task-due::${task.id}::${dueDate}::ahead`,
            kind: "task-due",
            title: task.title,
            body: prefs.dueHeadsUpDays === 1 ? "Due tomorrow" : `Due ${fmt.date(dueDate)}`,
            triggerAt: atLocal(today, "00:00", zone),
            alertAt: madeAfter(headsUpAt),
            relevantUntil: endOfDay(headsUpAt, zone),
            entityId: task.id,
            route: taskRoute(task, today, zone),
            priority: "normal",
        });
    }
    return items;
}

/** Today's and tomorrow's starts of a timed block (each occurrence of a series). */
function blockStarts(task: ReminderTask & { scheduledStart: Instant }, zone: Zone, today: LocalDate): Instant[] {
    if (!task.recurrenceRule) return [task.scheduledStart];
    return expandSeries({
        rule: task.recurrenceRule,
        start: { instant: task.scheduledStart, end: task.scheduledEnd ?? undefined },
        zone,
        range: { from: today, to: addDays(today, 1) },
    }).flatMap((occurrence) => (occurrence.start ? [occurrence.start] : []));
}

/**
 * Timed blocks: one alert a lead before each start (a Fixed block gets its own lead).
 * An explicit reminder on the task wins, so the block never alerts twice.
 */
function blockReminders(task: ReminderTask, ctx: DeriveContext): Reminder[] {
    if (!task.scheduledStart || (task.reminderAt && !task.reminderSilenced)) return [];
    const { now, zone, fmt, prefs, today } = ctx;
    const lead = (task.interactionMode === "timetable" ? prefs.fixedLeadMinutes : prefs.blockLeadMinutes) * 60_000;
    const items: Reminder[] = [];
    for (const start of blockStarts({ ...task, scheduledStart: task.scheduledStart }, zone, today)) {
        const diffMs = Date.parse(start) - now.getTime();
        if (diffMs > lead + HOUR || diffMs <= -30 * 60_000) continue;
        items.push({
            id: `block-start::${task.id}::${start}`,
            kind: "block-start",
            title: task.title,
            body: diffMs > 0 ? `Starts at ${fmt.time(start)}` : "Started",
            triggerAt: new Date(Date.parse(start) - lead).toISOString(),
            alertAt: new Date(Date.parse(start) - lead).toISOString(),
            relevantUntil: start,
            entityId: task.id,
            route: taskRoute(task, today, zone),
            priority: "normal",
        });
    }
    return items;
}

function taskReminders(task: ReminderTask, ctx: DeriveContext): Reminder[] {
    if (task.state === "COMPLETE" || task.state === "ARCHIVED") return [];
    const own = [explicitReminder(task, ctx), waitingFollowUp(task, ctx)].filter((item): item is Reminder => item !== null);
    return [...own, ...deadlineReminders(task, ctx), ...blockReminders(task, ctx)];
}

/** Today's log (when the routine is due and not paused, made or not): remind each time still open. */
function habitReminders(habit: ReminderHabit, { now, zone, prefs, today }: DeriveContext): Reminder[] {
    if (habit.archived || !habit.reminderEnabled) return [];
    const log = habit.logs?.find((entry) => entry.targetDate === today);
    if (!log) return [];
    const times = routineTimesOn(habit, today);
    const marks = timeMarksOn(times, log);
    const setTimes = Boolean(habit.times?.length);
    const items: Reminder[] = [];
    for (const time of times) {
        if (setTimes ? marks[time] : log.status !== "PENDING") continue;
        const target = atLocal(today, time, zone);
        const diffMs = Date.parse(target) - now.getTime();
        if (Math.abs(diffMs) > 2 * HOUR) continue;
        const timePart = setTimes ? `::${time}` : "";
        items.push({
            id: `habit-reminder::${habit.id}::${today}${timePart}`,
            kind: "habit-reminder",
            title: habit.title,
            body: diffMs > 0 ? `Due at ${time.slice(0, 5)}` : "Due now",
            triggerAt: target,
            alertAt: new Date(Date.parse(target) - prefs.habitReminderLeadMinutes * 60_000).toISOString(),
            relevantUntil: endOfDay(target, zone),
            entityId: habit.id,
            route: "/routines",
            priority: "normal",
        });
    }
    return items;
}

function aheadLabel(ahead: number) {
    if (ahead === 0) return "Today";
    return ahead === 1 ? "Tomorrow" : `In ${ahead} days`;
}

/**
 * Yearly personal events with their per-event bell on: a morning nudge on the day and on
 * each chosen day before. The id carries the event's year-day, so each year's occurrence is a
 * fresh, stable candidate (and a heads-up is its own, dismissed on its own).
 */
function eventReminders(event: PersonalEvent, { zone, prefs, today }: DeriveContext): Reminder[] {
    if (!event.notify) return [];
    const year = Number(today.slice(0, 4));
    const items: Reminder[] = [];
    for (const ahead of prefs.eventDaysBefore) {
        const day = [year, year + 1].map((y) => personalEventDay(event.monthDay, y)).find((d) => daysBetween(today, d) === ahead);
        if (!day) continue;
        const at = atLocal(today, prefs.morningTime, zone);
        const aheadPart = ahead ? `::${ahead}d` : "";
        items.push({
            id: `personal-event::${event.id}::${day}${aheadPart}`,
            kind: "personal-event",
            title: event.label,
            body: aheadLabel(ahead),
            triggerAt: at,
            alertAt: at,
            relevantUntil: endOfDay(at, zone),
            entityId: event.id,
            route: "/events",
            priority: "normal",
        });
    }
    return items;
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
    const ctx: DeriveContext = { now, zone, fmt, prefs: { ...DEFAULT_REMINDER_PREFS, ...given }, today: todayIn(zone, now) };
    return [
        ...input.tasks.flatMap((task) => taskReminders(task, ctx)),
        ...input.habits.flatMap((habit) => habitReminders(habit, ctx)),
        ...(input.personalEvents ?? []).flatMap((event) => eventReminders(event, ctx)),
    ];
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

/** When the quiet hours or pause covering `at` end (chained: a pause can end inside quiet hours); `at` itself when nothing silenced it. */
function releasedAt(at: Instant, gate: AlertGate): number {
    const { enabled, start, end } = gate.quietHours;
    let ms = Date.parse(at);
    for (let step = 0; step < 3; step++) {
        const moment = new Date(ms);
        if (isPaused(moment, gate.pausedUntil)) {
            ms = Date.parse(gate.pausedUntil!);
        } else if (isInQuietHours(moment, gate.zone, enabled, start, end)) {
            const day = dayOf(moment, gate.zone);
            const endToday = Date.parse(atLocal(day, end!, gate.zone));
            ms = endToday > ms ? endToday : Date.parse(atLocal(addDays(day, 1), end!, gate.zone));
        } else {
            break;
        }
    }
    return ms;
}

/** A deferral counts only when it is later than the alert itself. */
function deferralOf(alertAt: Instant, deferredUntil: Instant | null | undefined): Instant | null {
    return deferredUntil && Date.parse(deferredUntil) > Date.parse(alertAt) ? deferredUntil : null;
}

/** Due, and neither paused nor in quiet hours. */
function sendableNow(at: Instant, gate: AlertGate): boolean {
    if (gate.now.getTime() < Date.parse(at)) return false;
    if (isPaused(gate.now, gate.pausedUntil)) return false;
    return !isInQuietHours(gate.now, gate.zone, gate.quietHours.enabled, gate.quietHours.start, gate.quietHours.end);
}

/** Too late to send: a due-day alert past its day (unless deferred), anything else long after its release. */
function isLate(reminder: Reminder, at: Instant, deferred: Instant | null, released: number, gate: AlertGate): boolean {
    if (reminder.kind === "task-due" && !deferred) return dayOf(at, gate.zone) !== todayIn(gate.zone, gate.now);
    return gate.now.getTime() - released > LATE_ALERT_MS;
}

/**
 * The one OS-delivery policy for every transport. Returns the key and instant to send now, or
 * null: not due yet, too late, no longer relevant, dismissed, or silenced. Quiet hours and a pause
 * silence every OS alert (high priority included; the app list still shows it) and hold it: it
 * goes out when they end, while it is still relevant (`relevantUntil`). A deferral is a new
 * delivery at its own instant, so the key changes with it.
 */
export function dueAlert(reminder: Reminder, gate: AlertGate): { key: string; at: Instant } | null {
    if (!reminder.alertAt || gate.dismissed) return null;
    const deferred = deferralOf(reminder.alertAt, gate.deferredUntil);
    const at = deferred ?? reminder.alertAt;
    if (!sendableNow(at, gate)) return null;
    const released = releasedAt(at, gate);
    if (isLate(reminder, at, deferred, released, gate)) return null;
    // Only a held alert can go stale; a deferral is the person's own choice of time.
    const held = released > Date.parse(at);
    if (held && !deferred && reminder.relevantUntil && gate.now.getTime() >= Date.parse(reminder.relevantUntil)) return null;
    return { key: deferred ? `${reminder.id}@${deferred}` : reminder.id, at };
}
