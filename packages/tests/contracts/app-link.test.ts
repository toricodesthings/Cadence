import { describe, expect, it } from "vitest";
import { insertHabitSchema, updateHabitSchema } from "@cadence/contracts/habit";
import { insertTaskSchema, updateTaskSchema } from "@cadence/contracts/task";

describe("linkedAppId", () => {
    it.each([
        ["task", updateTaskSchema],
        ["routine", updateHabitSchema],
    ] as const)("%s update: omitted leaves it alone, null removes, a known id attaches", (_, schema) => {
        expect(schema.parse({})).not.toHaveProperty("linkedAppId");
        expect(schema.parse({ title: "x" })).not.toHaveProperty("linkedAppId");
        expect(schema.parse({ linkedAppId: null })).toHaveProperty("linkedAppId", null);
        expect(schema.parse({ linkedAppId: "gmail" })).toHaveProperty("linkedAppId", "gmail");
    });

    it.each([
        ["task", updateTaskSchema],
        ["routine", updateHabitSchema],
    ] as const)("%s update rejects a URL or an unknown id", (_, schema) => {
        expect(schema.safeParse({ linkedAppId: "https://example.com" }).success).toBe(false);
        expect(schema.safeParse({ linkedAppId: "not-an-app" }).success).toBe(false);
    });

    it("creates never default it", () => {
        expect(insertTaskSchema.parse({ title: "x", orderIndex: 1 })).not.toHaveProperty("linkedAppId");
        expect(insertHabitSchema.parse({ title: "x", recurrenceRule: "FREQ=DAILY" })).not.toHaveProperty("linkedAppId");
    });
});
