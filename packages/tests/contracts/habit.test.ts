import { describe, expect, it } from "vitest";
import {
    habitListQuerySchema,
    habitTargetTimesSchema,
    routineStepsSchema,
    insertHabitSchema,
    resolveHabitActionSchema,
    weeklyHabitsQuerySchema,
} from "@cadence/contracts/habit";

describe("habit list queries", () => {
    it("default to active (unarchived) habits", () => {
        expect(habitListQuerySchema.parse({})).toEqual({ archived: false });
    });

    it("read the archived flag the same way in weekly queries, defaulting timezone to UTC", () => {
        expect(weeklyHabitsQuerySchema.parse({ start: "2026-03-03", end: "2026-03-09", archived: "true" })).toEqual({
            start: "2026-03-03",
            end: "2026-03-09",
            archived: true,
            timezone: "UTC",
        });
    });

    it("treat any archived value other than 'true' as false", () => {
        expect(habitListQuerySchema.parse({ archived: "yes" })).toEqual({ archived: false });
    });

});

describe("insertHabitSchema", () => {
    it("requires a title and a recurrence rule, and adds no defaults", () => {
        expect(insertHabitSchema.parse({ title: "Stretch", recurrenceRule: "FREQ=DAILY" })).toEqual({
            title: "Stretch",
            recurrenceRule: "FREQ=DAILY",
        });
        expect(insertHabitSchema.safeParse({ title: "Stretch" }).success).toBe(false);
    });
});

describe("habitTargetTimesSchema", () => {
    it("accepts HH:MM or '' ('any time') per weekday", () => {
        expect(habitTargetTimesSchema.safeParse({ MO: "07:30", SU: "" }).success).toBe(true);
    });

    it.each([[{ MO: "7:30" }], [{ XX: "07:30" }], [{ MO: "morning" }]])("rejects %j", (value) => {
        expect(habitTargetTimesSchema.safeParse(value).success).toBe(false);
    });
});

describe("resolveHabitActionSchema", () => {
    it.each([
        [{ targetDate: "2026-03-09", status: "COMPLETED" }, true],
        [{ targetDate: "2026-03-09T08:00:00.000Z", status: "SKIPPED" }, true],
        [{ targetDate: "2026-03-09", status: "COMPLETED", timezone: "America/New_York" }, true],
        [{ targetDate: "03/09/2026", status: "COMPLETED" }, false],
        [{ targetDate: "2026-03-09", status: "DONE" }, false],
    ])("%j → %s", (body, ok) => {
        expect(resolveHabitActionSchema.safeParse(body).success).toBe(ok);
    });
});

describe("routineStepsSchema", () => {
    it("takes up to 12 named steps with unique ids", () => {
        expect(routineStepsSchema.safeParse([{ id: "a", title: "Water" }, { id: "b", title: "Stretch" }]).success).toBe(true);
        expect(routineStepsSchema.safeParse([{ id: "a", title: "Water" }, { id: "a", title: "Stretch" }]).success).toBe(false);
        expect(routineStepsSchema.safeParse([{ id: "a", title: "  " }]).success).toBe(false);
        expect(routineStepsSchema.safeParse(Array.from({ length: 13 }, (_, i) => ({ id: String(i), title: "x" }))).success).toBe(false);
    });
});
