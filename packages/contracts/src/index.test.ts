import { describe, expect, it } from "vitest";
import { insertTaskSchema, taskPrioritySchema } from "./task";
import { SETTINGS_DEFAULTS, userSettingsSchema } from "./settings";
import { TASK_PRIORITY_LABELS, TAG_PALETTE } from "./constants";

// Lightweight smoke tests — the heavy lifting (Drizzle row parity) is enforced
// at compile time in apps/backend/tests/unit/contract-parity.test.ts.

describe("@cadence/contracts", () => {
    it("parses a minimal valid task input and applies defaults", () => {
        const parsed = insertTaskSchema.parse({ title: "Write spec", orderIndex: 1 });
        expect(parsed.state).toBe("ACTIVE");
        expect(parsed.priority).toBe(0);
        expect(parsed.isAllDay).toBe(true);
    });

    it("rejects out-of-range priority", () => {
        expect(taskPrioritySchema.safeParse(5).success).toBe(false);
        expect(taskPrioritySchema.safeParse(2).success).toBe(true);
    });

    it("accepts the canonical settings defaults", () => {
        expect(userSettingsSchema.safeParse(SETTINGS_DEFAULTS).success).toBe(true);
    });

    it("exposes shared semantic constants", () => {
        expect(TASK_PRIORITY_LABELS[4]).toBe("Urgent");
        expect(TAG_PALETTE[0]).toBe("default");
        expect(TAG_PALETTE).toContain("#7ee787");
    });
});
