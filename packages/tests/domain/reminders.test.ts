import { describe, expect, it } from "vitest";
import { deriveReminders, dueAlert, type Reminder, type ReminderHabit, type ReminderTask } from "@cadence/domain/reminders";

const zone = "America/Toronto";
const fmt = { time: (i: string) => i.slice(11, 16), date: (d: string) => d };
const quiet = { enabled: false, start: null, end: null };
const task = (over: Partial<ReminderTask>): ReminderTask => ({
    id: "t1", title: "Pay rent", state: "ACTIVE", projectId: null, dueDate: null,
    reminderAt: null, reminderSilenced: false, waitingOn: null, waitingReminder: null, ...over,
});
const derive = (tasks: ReminderTask[], now: string, habits: ReminderHabit[] = [], lead = 15) =>
    deriveReminders({ tasks, habits }, new Date(now), zone, fmt, lead);

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
        const [r] = derive([], "2026-10-07T17:00:00-04:00", [habit], 30);
        expect(Date.parse(r.triggerAt)).toBe(Date.parse("2026-10-07T18:00:00-04:00"));
        expect(Date.parse(r.alertAt!)).toBe(Date.parse("2026-10-07T17:30:00-04:00"));
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
