import { describe, expect, it } from "vitest";
import { insertPersonalEventSchema, updatePersonalEventSchema } from "@cadence/contracts/personal-event";

describe("insertPersonalEventSchema", () => {
    it("accepts a minimal label and monthDay", () => {
        expect(insertPersonalEventSchema.safeParse({ label: "Mom", monthDay: "03-14" }).success).toBe(true);
    });

    it.each([
        [{ label: "Mom", monthDay: "13-01" }, "a month past 12"],
        [{ label: "x".repeat(81), monthDay: "03-14" }, "an 81-char label"],
        [{ label: "Mom", monthDay: "03-14", emoji: "12345" }, "a 5-char emoji"],
        [{ label: "Mom", monthDay: "03-14", id: "abc123" }, "a non-uuid id"],
    ])("rejects %j (%s)", (body, _why) => {
        expect(insertPersonalEventSchema.safeParse(body).success).toBe(false);
    });
});

describe("updatePersonalEventSchema", () => {
    it("rejects unknown keys", () => {
        expect(updatePersonalEventSchema.safeParse({ label: "x", userId: "y" }).success).toBe(false);
    });
});
