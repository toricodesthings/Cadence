import { describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { dayMinutes, formatDayMinutes } from "../../../../app/lib/utils/task/day-load";

const t = (patch: Partial<Task>) => ({ dueDate: "2026-10-20", endDate: null, scheduledStart: null, scheduledEnd: null, durationEstimate: null, isHabit: false, ...patch }) as Task;
const none = () => null;

describe("dayMinutes", () => {
    it("adds blocks, estimates and supported guesses, and counts the rest as not sized", () => {
        const tasks = [
            t({ scheduledStart: "2026-10-20T14:00:00.000Z", scheduledEnd: "2026-10-20T15:30:00.000Z" }),
            t({ durationEstimate: 5 }),
            t({ id: "guessed" } as Partial<Task>),
            t({ id: "tentative" } as Partial<Task>),
            t({}),
        ];
        const guessOf = (task: Task) => ((task as { id?: string }).id === "guessed" ? { state: "supported" as const, minutes: 45 } : (task as { id?: string }).id === "tentative" ? { state: "tentative" as const, minutes: 30 } : null);
        expect(dayMinutes(tasks, guessOf)).toEqual({ minutes: 90 + 5 + 45, unsized: 2 });
    });
    it("leaves out routines and all-day multi-day tasks", () => {
        expect(dayMinutes([t({ isHabit: true, durationEstimate: 30 }), t({ endDate: "2026-10-22", durationEstimate: 30 })], none)).toEqual({ minutes: 0, unsized: 0 });
    });
    it("reads as about 4 h", () => {
        expect(["45", "240", "250", "90"].map((m) => formatDayMinutes(Number(m)))).toEqual(["45 min", "4 h", "4 h 15 min", "1 h 30 min"]);
    });
});
