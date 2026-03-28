import { describe, expect, it } from "vitest";
import { habitListQuerySchema, weeklyHabitsQuerySchema } from "../../src/domains/habits/habits.schema";

describe("habit route parity", () => {
    it("defaults archived list queries to active habits", () => {
        expect(habitListQuerySchema.parse({})).toEqual({ archived: false });
    });

    it("uses the same archived semantics for weekly queries", () => {
        expect(weeklyHabitsQuerySchema.parse({ start: "2026-03-03", end: "2026-03-09", archived: "true" })).toEqual({
            start: "2026-03-03",
            end: "2026-03-09",
            archived: true,
            timezone: "UTC",
        });
    });
});
