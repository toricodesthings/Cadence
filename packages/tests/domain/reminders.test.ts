import { describe, expect, it } from "vitest";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { DEFAULT_REMINDER_PREFS, deriveReminders, dueAlert, type Reminder, type ReminderHabit, type ReminderTask } from "@cadence/domain/reminders";

const zone = "America/Toronto";
const fmt = { time: (i: string) => i.slice(11, 16), date: (d: string) => d };
const quiet = { enabled: false, start: null, end: null };
const task = (over: Partial<ReminderTask>): ReminderTask => ({
    id: "t1", title: "Pay rent", state: "ACTIVE", projectId: null, dueDate: null,
    reminderAt: null, reminderSilenced: false, waitingOn: null, waitingReminder: null, ...over,
});
const derive = (tasks: ReminderTask[], now: string, habits: ReminderHabit[] = [], prefs = {}) =>
    deriveReminders({ tasks, habits }, new Date(now), zone, fmt, prefs);
const event = { id: "e1", label: "Mum's birthday", monthDay: "10-20", emoji: null, notify: true, startedOn: null };

describe("deriveReminders", () => {
    it("alerts a deadline at 09:00 on its day, not at midnight", () => {
        const [due] = derive([task({ dueDate: "2026-10-07" })], "2026-10-07T12:00:00-04:00");
        expect(due.triggerAt).toBe("2026-10-07T04:00:00.000Z");
        expect(due.alertAt).toBe("2026-10-07T13:00:00.000Z");
    });

    it("never alerts a deadline for a task made after the alert time", () => {
        const [due] = derive([task({ dueDate: "2026-10-07", createdAt: "2026-10-07T10:00:00-04:00" })], "2026-10-07T12:00:00-04:00");
        expect(due.alertAt).toBeNull();
    });

    it("alerts a routine one lead time before its target", () => {
        const habit = { id: "h1", title: "Gym", archived: false, reminderEnabled: true, targetTime: "18:00", targetTimes: null,
            logs: [{ targetDate: "2026-10-07", status: "PENDING" }] } as ReminderHabit;
        const [r] = derive([], "2026-10-07T17:00:00-04:00", [habit], { habitReminderLeadMinutes: 30 });
        expect(Date.parse(r.triggerAt)).toBe(Date.parse("2026-10-07T18:00:00-04:00"));
        expect(Date.parse(r.alertAt!)).toBe(Date.parse("2026-10-07T17:30:00-04:00"));
    });
});

describe("reminder prefs", () => {
    it("default prefs match the settings defaults", () => {
        for (const [key, value] of Object.entries(DEFAULT_REMINDER_PREFS)) {
            expect(SETTINGS_DEFAULTS.notifications[key as keyof typeof SETTINGS_DEFAULTS.notifications]).toEqual(value);
        }
    });

    it("alerts a deadline at the user's morning time", () => {
        const [due] = derive([task({ dueDate: "2026-10-07" })], "2026-10-07T12:00:00-04:00", [], { morningTime: "07:30" });
        expect(due.alertAt).toBe("2026-10-07T11:30:00.000Z");
    });

    it("lists a missed deadline only for the chosen days", () => {
        const t = task({ dueDate: "2026-10-04" });
        expect(derive([t], "2026-10-07T12:00:00-04:00", [], { overdueDays: 3 })).toHaveLength(1);
        expect(derive([t], "2026-10-07T12:00:00-04:00", [], { overdueDays: 1 })).toHaveLength(0);
    });

    it("adds a separate heads-up the chosen days before a deadline", () => {
        const t = task({ dueDate: "2026-10-14" });
        expect(derive([t], "2026-10-12T12:00:00-04:00")).toHaveLength(0);
        const [ahead] = derive([t], "2026-10-12T12:00:00-04:00", [], { dueHeadsUpDays: 2 });
        expect(ahead.id).toBe("task-due::t1::2026-10-14::ahead");
        expect(ahead.alertAt).toBe("2026-10-12T13:00:00.000Z");
        expect(derive([t], "2026-10-13T12:00:00-04:00", [], { dueHeadsUpDays: 2 })).toHaveLength(0);
    });
});

describe("timed blocks", () => {
    const block = (over: Partial<ReminderTask> = {}) => task({ scheduledStart: "2026-10-07T14:00:00-04:00", scheduledEnd: "2026-10-07T15:00:00-04:00", ...over });

    it("alerts 10 minutes before a block, 30 before a Fixed one", () => {
        const [plain] = derive([block()], "2026-10-07T13:00:00-04:00");
        expect(Date.parse(plain.alertAt!)).toBe(Date.parse("2026-10-07T13:50:00-04:00"));
        const [fixed] = derive([block({ interactionMode: "timetable" })], "2026-10-07T13:00:00-04:00");
        expect(Date.parse(fixed.alertAt!)).toBe(Date.parse("2026-10-07T13:30:00-04:00"));
    });

    it("skips far-off, finished and explicitly reminded blocks", () => {
        expect(derive([block()], "2026-10-07T08:00:00-04:00")).toHaveLength(0);
        expect(derive([block()], "2026-10-07T14:45:00-04:00")).toHaveLength(0);
        expect(derive([block({ reminderAt: "2026-10-07T13:00:00-04:00" })], "2026-10-07T13:00:00-04:00").map((r) => r.kind)).toEqual(["task-reminder"]);
    });

    it("expands a repeating block into today's occurrence at the same local time", () => {
        const weekly = block({ scheduledStart: "2026-09-02T14:00:00-04:00", scheduledEnd: "2026-09-02T15:00:00-04:00", recurrenceRule: "FREQ=WEEKLY;BYDAY=WE", interactionMode: "timetable" });
        const [r] = derive([weekly], "2026-10-07T13:00:00-04:00");
        expect(r.id).toBe(`block-start::t1::${new Date("2026-10-07T14:00:00-04:00").toISOString()}`);
        expect(derive([weekly], "2026-10-08T13:00:00-04:00")).toHaveLength(0);
    });
});

describe("yearly events", () => {
    const events = (now: string, eventDaysBefore: number[]) =>
        deriveReminders({ tasks: [], habits: [], personalEvents: [event] }, new Date(now), zone, fmt, { eventDaysBefore });

    it("nudges on each chosen day, each its own occurrence", () => {
        expect(events("2026-10-20T08:00:00-04:00", [0, 1, 7]).map((r) => r.body)).toEqual(["Today"]);
        expect(events("2026-10-19T08:00:00-04:00", [0, 1, 7]).map((r) => [r.id, r.body])).toEqual([["personal-event::e1::2026-10-20::1d", "Tomorrow"]]);
        expect(events("2026-10-13T08:00:00-04:00", [0, 1, 7]).map((r) => r.body)).toEqual(["In 7 days"]);
        expect(events("2026-10-13T08:00:00-04:00", [0])).toHaveLength(0);
    });

    it("looks ahead across New Year", () => {
        const jan = { ...event, monthDay: "01-03" };
        const [r] = deriveReminders({ tasks: [], habits: [], personalEvents: [jan] }, new Date("2026-12-27T08:00:00-05:00"), zone, fmt, { eventDaysBefore: [7] });
        expect(r.id).toBe("personal-event::e1::2027-01-03::7d");
    });
});

describe("dueAlert", () => {
    const reminder = (over: Partial<Reminder> = {}): Reminder => ({
        id: "task-reminder::t1::x", kind: "task-reminder", title: "t", body: "b", triggerAt: "2026-10-07T10:00:00-04:00",
        alertAt: "2026-10-07T10:00:00-04:00", entityId: "t1", route: "/", priority: "high", ...over,
    });
    const gate = (now: string, over = {}) => ({ now: new Date(now), zone, quietHours: quiet, dismissed: false, ...over });

    it("sends from the alert instant until the late bound", () => {
        expect(dueAlert(reminder(), gate("2026-10-07T09:59:00-04:00"))).toBeNull();
        expect(dueAlert(reminder(), gate("2026-10-07T10:00:30-04:00"))?.key).toBe("task-reminder::t1::x");
        expect(dueAlert(reminder(), gate("2026-10-07T10:16:00-04:00"))).toBeNull();
    });

    it("keeps a deadline alert alive until the day ends", () => {
        const due = reminder({ kind: "task-due", alertAt: "2026-10-07T09:00:00-04:00" });
        expect(dueAlert(due, gate("2026-10-07T20:00:00-04:00"))).not.toBeNull();
        expect(dueAlert(due, gate("2026-10-08T00:30:00-04:00"))).toBeNull();
    });

    it("is silent while paused, then resumes", () => {
        const pausedUntil = "2026-10-07T11:00:00-04:00";
        expect(dueAlert(reminder(), gate("2026-10-07T10:01:00-04:00", { pausedUntil }))).toBeNull();
        expect(dueAlert(reminder(), gate("2026-10-07T10:01:00-04:00", { pausedUntil: "2026-10-07T10:00:30-04:00" }))).not.toBeNull();
    });

    it("silences every alert in quiet hours, high priority included", () => {
        const q = { enabled: true, start: "09:00", end: "11:00" };
        expect(dueAlert(reminder(), gate("2026-10-07T10:01:00-04:00", { quietHours: q }))).toBeNull();
    });

    it("skips dismissed ones and re-delivers a deferral under a new key", () => {
        expect(dueAlert(reminder(), gate("2026-10-07T10:01:00-04:00", { dismissed: true }))).toBeNull();
        const deferred = "2026-10-07T12:00:00-04:00";
        expect(dueAlert(reminder(), gate("2026-10-07T11:00:00-04:00", { deferredUntil: deferred }))).toBeNull();
        expect(dueAlert(reminder(), gate("2026-10-07T12:02:00-04:00", { deferredUntil: deferred }))?.key).toBe(`task-reminder::t1::x@${deferred}`);
    });
});
