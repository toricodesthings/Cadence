import { describe, expect, it } from "vitest";
import { insertHabitSchema, updateHabitSchema } from "@cadence/contracts/habit";
import { insertTaskSchema, updateTaskSchema } from "@cadence/contracts/task";
import { parseWebsite } from "@cadence/contracts/app-link";

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

describe("parseWebsite / linkedUrl", () => {
    it.each([
        ["https://example.com", "https://example.com/"],
        ["  https://www.Example.com/a?b=1#c ", "https://www.example.com/a?b=1#c"],
        ["example.com/path", "https://example.com/path"],
        ["https://bücher.de", "https://xn--bcher-kva.de/"],
    ])("%j → %s", (input, expected) => expect(parseWebsite(input)).toBe(expected));

    it.each([
        "", "https://", "http://example.com", "javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,x", "file:///etc/passwd",
        "ftp://example.com", "https://user:pass@example.com", "https://localhost", "https://example.", "https://exa mple.com",
        "https://exa\nmple.com", `https://example.com/${"a".repeat(2100)}`, "mfp://",
    ])("refuses %j", (input) => expect(parseWebsite(input)).toBeNull());

    it("the update schemas accept only the normalised https form, and null removes", () => {
        for (const schema of [updateTaskSchema, updateHabitSchema]) {
            expect(schema.parse({ linkedUrl: "https://example.com/" })).toHaveProperty("linkedUrl", "https://example.com/");
            expect(schema.parse({ linkedUrl: null })).toHaveProperty("linkedUrl", null);
            expect(schema.parse({})).not.toHaveProperty("linkedUrl");
            expect(schema.safeParse({ linkedUrl: "javascript:alert(1)" }).success).toBe(false);
            expect(schema.safeParse({ linkedUrl: "https://example.com" }).success).toBe(false); // unnormalised: the client sends parseWebsite's form
        }
    });
});
