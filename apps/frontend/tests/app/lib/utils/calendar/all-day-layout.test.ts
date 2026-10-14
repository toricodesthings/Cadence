import { describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { buildAllDayWeekLayout } from "../../../../../app/lib/utils/calendar/all-day-layout";

const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
const task = (id: string, day: string, endDate: string | null = null, priority = 0) =>
    ({
        id,
        title: id,
        dueDate: day,
        endDate,
        scheduledStart: null,
        state: "ACTIVE",
        priority,
    }) as Task;

describe("week all-day packing", () => {
    it("fills both free Thursday cells despite two Monday–Tuesday bars and folds only its third task", () => {
        const bars = [task("a", week[0], week[1]), task("b", week[0], week[1])];
        const thursday = [task("plain", week[3]), task("high", week[3], null, 3), task("medium", week[3], null, 2)];
        const model = buildAllDayWeekLayout(week, { [week[0]]: bars, [week[1]]: bars, [week[3]]: thursday });
        expect(model.days[3].shown.map(({ task, row }) => [task.id, row])).toEqual([
            ["high", 0],
            ["medium", 1],
        ]);
        expect(model.days[3].overflow.map((task) => task.id)).toEqual(["plain"]);
        expect(model.days[3].secondRow.map((task) => task.id)).toEqual(["medium"]);
    });
    it("keeps overflow and short-window hidden bars local to the days they occupy", () => {
        const bars = [task("a", week[0], week[1]), task("b", week[0], week[1]), task("c", week[0], week[1])];
        const model = buildAllDayWeekLayout(week, { [week[0]]: bars, [week[1]]: bars });
        expect(model.days[0].overflow.map((task) => task.id)).toEqual(["c"]);
        expect(model.days[0].secondRow.map((task) => task.id)).toEqual(["b"]);
        expect(model.days[2]).toMatchObject({ shown: [], overflow: [], secondRow: [] });
    });
    it("draws a clipped multi-day item once and reserves only its occupied columns", () => {
        const span = task("span", "2026-10-10", week[1]);
        const model = buildAllDayWeekLayout(week, {
            [week[0]]: [span],
            [week[1]]: [span],
            [week[6]]: [task("Sunday", week[6])],
        });
        expect(model.shownBars).toHaveLength(1);
        expect(model.shownBars[0]).toMatchObject({ from: 0, to: 1, clippedStart: true, clippedEnd: false });
        expect(model.days[6].shown[0].row).toBe(0);
    });
});
