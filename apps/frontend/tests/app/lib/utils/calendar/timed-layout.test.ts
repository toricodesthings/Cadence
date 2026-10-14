import { describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { buildTimedTaskLayouts, MARKER_HEIGHT } from "../../../../../app/lib/utils/calendar/calendar-utils";

const at = (id: string, start: string, end?: string, extra: Partial<Task> = {}) => ({
    id, title: id, scheduledStart: `2026-10-12T${start}:00-04:00`, scheduledEnd: end ? `2026-10-12T${end}:00-04:00` : null, ...extra,
}) as unknown as Task;

describe("buildTimedTaskLayouts", () => {
    it("docks a routine on the class it overlaps without splitting the class", () => {
        const out = buildTimedTaskLayouts([at("class", "10:05", "11:25"), at("pill", "11:00", undefined, { isHabit: true })]);
        const cls = out.find((l) => l.task.id === "class")!;
        expect(cls).toMatchObject({ columns: 1, badge: true });
        expect(out.find((l) => l.task.id === "pill")!.marker).toBe("badge");
    });

    it("still splits two overlapping classes", () => {
        const out = buildTimedTaskLayouts([at("a", "10:00", "11:00"), at("b", "10:30", "11:30")]);
        expect(out.map((l) => l.columns)).toEqual([2, 2]);
    });

    it("gives a lone routine a row and groups routines at one minute into one marker", () => {
        const lone = buildTimedTaskLayouts([at("r", "17:00", undefined, { isHabit: true })]);
        expect(lone[0].marker).toBe("row");
        const two = buildTimedTaskLayouts([at("s", "07:00", undefined, { isHabit: true }), at("w", "07:00", undefined, { isHabit: true })]);
        expect(two).toHaveLength(1);
        if (!two[0].marker) throw new Error("Expected a routine marker");
        expect(two[0].points).toHaveLength(2);
    });

    it("never renders a span shorter than a marker", () => {
        expect(buildTimedTaskLayouts([at("call", "09:00", "09:15")])[0].height).toBe(MARKER_HEIGHT);
    });
});
