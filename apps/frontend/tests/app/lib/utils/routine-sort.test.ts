import { describe, expect, it } from "vitest";
import type { Habit } from "@cadence/contracts/habit";
import { sortRoutines } from "../../../../app/lib/utils/habits";

const routine = (id: string, patch: Partial<Habit>): Habit => ({
    id, title: id, createdAt: "2026-10-01T09:00:00Z", sortOrder: 0, targetTime: null, times: null, isDueToday: true, isOverdue: false, ...patch,
} as Habit);

const a = routine("a", { title: "Stretch", createdAt: "2026-10-01T09:00:00Z", targetTime: "21:00", sortOrder: 3 });
const b = routine("b", { title: "hydrate", createdAt: "2026-10-02T09:00:00Z", sortOrder: 1 });
const c = routine("c", { title: "Gym", createdAt: "2026-10-03T09:00:00Z", times: ["07:00", "18:00"], sortOrder: 2 });
const ids = (list: Habit[]) => list.map((habit) => habit.id);

describe("sortRoutines", () => {
    it("orders by when each routine was made, by default", () => {
        expect(ids(sortRoutines([c, a, b], "created"))).toEqual(["a", "b", "c"]);
    });

    it("never moves a routine because today's check-in changed", () => {
        const done = { ...a, isDueToday: false };
        expect(ids(sortRoutines([done, b, c], "created"))).toEqual(["a", "b", "c"]);
    });

    it("sorts by first time of day with anytime routines last, by name, or by the dragged order", () => {
        expect(ids(sortRoutines([a, b, c], "time"))).toEqual(["c", "a", "b"]);
        expect(ids(sortRoutines([a, b, c], "name"))).toEqual(["c", "b", "a"]);
        expect(ids(sortRoutines([a, b, c], "custom"))).toEqual(["b", "c", "a"]);
    });
});
