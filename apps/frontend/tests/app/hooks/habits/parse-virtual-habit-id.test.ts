import { describe, expect, it } from "vitest";
import { parseVirtualHabitId } from "../../../../app/hooks/habits/use-virtual-habit-tasks";

describe("parseVirtualHabitId", () => {
    it("reads the day, and the time when there is one", () => {
        expect(parseVirtualHabitId("habit-abc--2026-10-14")).toEqual({ habitId: "abc", day: "2026-10-14", time: null });
        expect(parseVirtualHabitId("habit-abc--2026-10-14--17:00")).toEqual({ habitId: "abc", day: "2026-10-14", time: "17:00" });
    });
    it("is null for a real task id", () => {
        expect(parseVirtualHabitId("3f1c2b4e-0000-4000-8000-000000000000")).toBeNull();
    });
});
