import { describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { dayLoad, freeGaps, groupByDate, scheduleKind, splitDay } from "../../../app/lib/utils/calendar/schedule-day";

const task = (patch: Partial<Task>): Task => ({
    id: patch.id ?? "t",
    title: "x",
    state: "ACTIVE",
    isAllDay: false,
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
            task({ id: "a", dueDate: "2026-09-22", isAllDay: true }),
            task({ id: "r", isHabit: true, isAllDay: true, dueDate: "2026-09-22", scheduledStart: "2026-09-22" }),
            task({ id: "b", scheduledStart: "2026-09-23T09:00:00" }),
        ]);
        expect(groups.get("2026-09-22")?.map((t) => t.id)).toEqual(["a", "r"]);
        expect(groups.get("2026-09-23")?.map((t) => t.id)).toEqual(["b"]);
    });

    it("finds free gaps between timed items, only ahead of now", () => {
        const { timed, allDay } = splitDay([
            task({ id: "late", scheduledStart: "2026-09-22T18:00:00", scheduledEnd: "2026-09-22T19:00:00" }),
            task({ id: "early", scheduledStart: "2026-09-22T07:00:00", scheduledEnd: "2026-09-22T08:00:00" }),
            task({ id: "short", scheduledStart: "2026-09-22T08:15:00", scheduledEnd: "2026-09-22T09:00:00" }),
            task({ id: "undated", dueDate: "2026-09-22", isAllDay: true }),
        ]);
        expect(allDay.map((t) => t.id)).toEqual(["undated"]);
        expect(timed.map((t) => t.id)).toEqual(["early", "short", "late"]);

        const gaps = freeGaps(timed, null);
        expect(gaps.map((g) => [g.afterId, g.minutes])).toEqual([["short", 540]]);

        const fromNow = freeGaps(timed, new Date("2026-09-22T14:00:00"));
        expect(fromNow.map((g) => [g.afterId, g.minutes])).toEqual([["now", 240]]);
        expect(freeGaps(timed, new Date("2026-09-22T17:45:00"))).toEqual([]);
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
