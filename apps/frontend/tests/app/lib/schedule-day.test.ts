import { beforeAll, describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { dayLoad, freeGaps, groupByDate, scheduleKind, splitDay, taskDays } from "../../../app/lib/utils/calendar/schedule-day";
import { setUserZone } from "../../../app/lib/utils/user-zone";

beforeAll(() => setUserZone("America/Toronto"));

const task = (patch: Partial<Task>): Task => ({
    id: patch.id ?? "t",
    title: "x",
    state: "ACTIVE",
    dueDate: null,
    scheduledStart: null,
    scheduledEnd: null,
    ...patch,
}) as Task;

describe("schedule-day", () => {
    it("names kinds by consequence", () => {
        expect(scheduleKind(task({ isHabit: true }))).toBe("routine");
        expect(scheduleKind(task({ interactionMode: "timetable" }))).toBe("fixed");
        expect(scheduleKind(task({}))).toBe("task");
    });

    it("groups routines with tasks so marks and lists agree", () => {
        const groups = groupByDate([
            task({ id: "a", dueDate: "2026-09-22" }),
            task({ id: "r", isHabit: true, dueDate: "2026-09-22" }),
            task({ id: "b", scheduledStart: "2026-09-23T13:00:00Z" }),
        ]);
        expect(groups.get("2026-09-22")?.map((t) => t.id)).toEqual(["a", "r"]);
        expect(groups.get("2026-09-23")?.map((t) => t.id)).toEqual(["b"]);
    });

    it("finds free gaps between timed items, only ahead of now", () => {
        const { timed, allDay } = splitDay([
            task({ id: "late", scheduledStart: "2026-09-22T22:00:00Z", scheduledEnd: "2026-09-22T23:00:00Z" }),
            task({ id: "early", scheduledStart: "2026-09-22T11:00:00Z", scheduledEnd: "2026-09-22T12:00:00Z" }),
            task({ id: "short", scheduledStart: "2026-09-22T12:15:00Z", scheduledEnd: "2026-09-22T13:00:00Z" }),
            task({ id: "undated", dueDate: "2026-09-22" }),
        ]);
        expect(allDay.map((t) => t.id)).toEqual(["undated"]);
        expect(timed.map((t) => t.id)).toEqual(["early", "short", "late"]);

        const gaps = freeGaps(timed, null);
        expect(gaps.map((g) => [g.afterId, g.minutes])).toEqual([["short", 540]]);

        const fromNow = freeGaps(timed, new Date("2026-09-22T18:00:00Z"));
        expect(fromNow.map((g) => [g.afterId, g.minutes])).toEqual([["now", 240]]);
        expect(freeGaps(timed, new Date("2026-09-22T21:45:00Z"))).toEqual([]);
    });

    it("shows a timed block on the user's day of its start, not the UTC day", () => {
        // 9pm in Toronto on the 22nd is already the 23rd in UTC.
        expect(taskDays(task({ scheduledStart: "2026-09-23T01:00:00Z" }))).toEqual(["2026-09-22"]);
    });

    it("spreads an all-day multi-day task over dueDate..endDate", () => {
        expect(taskDays(task({ dueDate: "2026-10-30", endDate: "2026-11-02" }))).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
        const groups = groupByDate([task({ id: "span", dueDate: "2026-10-30", endDate: "2026-11-01" })]);
        expect([...groups.keys()]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    });

    it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago"])("keeps an all-day task due 2026-10-05 on that day for a user in %s", (zone) => {
        setUserZone(zone);
        try {
            const groups = groupByDate([task({ id: "due", dueDate: "2026-10-05" })]);
            expect([...groups.keys()]).toEqual(["2026-10-05"]);
        } finally {
            setUserZone("America/Toronto");
        }
    });

    it("weighs only open tasks", () => {
        expect(dayLoad([
            task({ effort: 3 }),
            task({ state: "COMPLETE", effort: 3 }),
            task({ isHabit: true }),
            task({ interactionMode: "timetable" }),
            task({}),
        ])).toBe(4);
    });
});
