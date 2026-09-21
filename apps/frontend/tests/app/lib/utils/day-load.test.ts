import { describe, expect, it } from "vitest";
import { dayLoads, lightestDay } from "../../../../app/lib/utils/task/day-load";

describe("day load", () => {
    const start = new Date(2026, 8, 21);

    it("weights by effort and picks the earliest lightest day", () => {
        const loads = dayLoads([
            { dueDate: "2026-09-21", scheduledStart: null, effort: 3 },
            { dueDate: "2026-09-22", scheduledStart: null, effort: null },
            { dueDate: "2026-09-22", scheduledStart: null, effort: 1 },
            { dueDate: null, scheduledStart: "2026-09-23T09:00:00", effort: 1 },
            { dueDate: "2026-10-30", scheduledStart: null, effort: 3 },
        ], start, 3);
        expect([...loads.values()]).toEqual([3, 2, 1]);
        expect(lightestDay(loads)).toBe("2026-09-23");
        expect(lightestDay(dayLoads([], start))).toBe("2026-09-21");
    });
});
