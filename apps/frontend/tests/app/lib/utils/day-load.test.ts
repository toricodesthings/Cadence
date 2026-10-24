import { beforeEach, describe, expect, it } from "vitest";
import { setUserZone } from "../../../../app/lib/utils/user-zone";
import { dayLoads, lightestDay } from "../../../../app/lib/utils/task/day-load";

describe("day load", () => {
    const start = "2026-09-21";
    beforeEach(() => setUserZone("America/Toronto"));

    it("weights by effort and picks the earliest lightest day", () => {
        const loads = dayLoads([
            { dueDate: "2026-09-21", scheduledStart: null, scheduledEnd: null, effort: 3 },
            { dueDate: "2026-09-22", scheduledStart: null, scheduledEnd: null, effort: null },
            { dueDate: "2026-09-22", scheduledStart: null, scheduledEnd: null, effort: 1 },
            { dueDate: null, scheduledStart: "2026-09-23T13:00:00Z", scheduledEnd: null, effort: 1 },
            { dueDate: "2026-10-30", scheduledStart: null, scheduledEnd: null, effort: 3 },
        ], start, 3);
        // No effort set counts as middling (2), not light.
        expect([...loads.values()]).toEqual([3, 3, 1]);
        expect(lightestDay(loads)).toBe("2026-09-23");
        expect(lightestDay(dayLoads([], start))).toBe("2026-09-21");
    });

    it("weighs a timed block by its hours, so a long class is not light", () => {
        const loads = dayLoads([{ dueDate: null, scheduledStart: "2026-09-21T13:00:00Z", scheduledEnd: "2026-09-21T16:00:00Z", effort: 1 }], start, 2);
        expect([...loads.values()]).toEqual([3, 0]);
    });

    it("counts each routine block as 1, so a day full of routines is not free", () => {
        const loads = dayLoads([
            { dueDate: "2026-09-21", scheduledStart: null, scheduledEnd: null, effort: null, isHabit: true },
            { dueDate: null, scheduledStart: "2026-09-21T12:00:00Z", scheduledEnd: null, effort: null, isHabit: true },
        ], start, 2);
        expect([...loads.values()]).toEqual([2, 0]);
        expect(lightestDay(loads)).toBe("2026-09-22");
    });

    it("weighs an unset effort by its guess, and a chosen effort over it", () => {
        const loads = dayLoads([
            { dueDate: "2026-09-21", scheduledStart: null, scheduledEnd: null, effort: null },
            { dueDate: "2026-09-22", scheduledStart: null, scheduledEnd: null, effort: 3 },
        ], start, 2, () => 1);
        expect([...loads.values()]).toEqual([1, 3]);
    });
});
