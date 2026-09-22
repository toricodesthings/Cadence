import { describe, expect, it } from "vitest";
import {
    batchRescheduleSchema,
    batchStateSchema,
    canonicalNlpEnvelopeSchema,
    effortLevelSchema,
    insertTaskSchema,
    reorderTaskSchema,
    taskPrioritySchema,
} from "./task";

const UUID = "11111111-1111-4111-8111-111111111111";
const ids = (n: number) => Array(n).fill(UUID);

describe("insertTaskSchema", () => {
    it("fills the server defaults on a minimal task", () => {
        expect(insertTaskSchema.parse({ title: "Write spec", orderIndex: 1 })).toEqual({
            title: "Write spec",
            orderIndex: 1,
            state: "ACTIVE",
            isAllDay: true,
            timezoneLocked: false,
            priority: 0,
            isPinned: false,
            reminderSilenced: false,
        });
    });

    it("leaves interactionMode unset so the server can choose it", () => {
        expect(insertTaskSchema.parse({ title: "t", orderIndex: 1 })).not.toHaveProperty("interactionMode");
    });

    it("accepts the all-day write shape the frontend sends", () => {
        const input = {
            title: "Plan 13",
            orderIndex: 1,
            isAllDay: true,
            dueDate: "2026-03-09",
            scheduledEnd: "2026-03-10",
            tagIds: [UUID],
            nlp: { rawInput: "Plan 13 tomorrow", sourceSurface: "inline_add", dateStyle: "mdy" },
        };

        expect(insertTaskSchema.parse(input)).toMatchObject({ ...input, nlp: { ...input.nlp, dismissedEntityIds: [], userOverrides: {} } });
    });

    it.each([
        [{ title: "" }, "an empty title"],
        [{ title: "x".repeat(501) }, "a title over 500 chars"],
        [{ durationEstimate: 0 }, "a zero duration"],
        [{ durationEstimate: 1441 }, "a duration over a day"],
        [{ tagIds: ids(51) }, "more than 50 tags"],
        [{ reminderAt: "2026-03-09" }, "a date-only reminder (must be a datetime)"],
    ])("rejects %j (%s)", (override, _reason) => {
        expect(insertTaskSchema.safeParse({ title: "t", orderIndex: 1, ...override }).success).toBe(false);
    });
});

describe("priority and effort", () => {
    it.each([[0, true], [4, true], [5, false], [-1, false], [2.5, false]])("priority %d → %s", (value, ok) => {
        expect(taskPrioritySchema.safeParse(value).success).toBe(ok);
    });

    it.each([[1, true], [3, true], [0, false], [4, false]])("effort %d → %s", (value, ok) => {
        expect(effortLevelSchema.safeParse(value).success).toBe(ok);
    });
});

describe("canonicalNlpEnvelopeSchema", () => {
    it("defaults dismissed entities and overrides to empty", () => {
        expect(canonicalNlpEnvelopeSchema.parse({ rawInput: "x", sourceSurface: "quick_add", dateStyle: "dmy" })).toMatchObject({
            dismissedEntityIds: [],
            userOverrides: {},
        });
    });

    it("rejects an unknown source surface or date style", () => {
        expect(canonicalNlpEnvelopeSchema.safeParse({ rawInput: "x", sourceSurface: "fax", dateStyle: "mdy" }).success).toBe(false);
        expect(canonicalNlpEnvelopeSchema.safeParse({ rawInput: "x", sourceSurface: "quick_add", dateStyle: "iso" }).success).toBe(false);
    });
});

describe("batch and reorder limits", () => {
    it.each([
        ["batch state", batchStateSchema, (n: number) => ({ taskIds: ids(n), state: "COMPLETE" })],
        ["batch reschedule", batchRescheduleSchema, (n: number) => ({ taskIds: ids(n), scheduledStart: "2026-03-09" })],
    ] as const)("%s takes 1–50 tasks", (_label, schema, build) => {
        expect(schema.safeParse(build(1)).success).toBe(true);
        expect(schema.safeParse(build(50)).success).toBe(true);
        expect(schema.safeParse(build(0)).success).toBe(false);
        expect(schema.safeParse(build(51)).success).toBe(false);
    });

    it("reschedules as all-day unless told otherwise", () => {
        expect(batchRescheduleSchema.parse({ taskIds: ids(1), scheduledStart: "2026-03-09" }).isAllDay).toBe(true);
    });

    it("reorders up to 200 siblings at once", () => {
        expect(reorderTaskSchema.safeParse({ orderIndex: 1, orderedTaskIds: ids(200) }).success).toBe(true);
        expect(reorderTaskSchema.safeParse({ orderIndex: 1, orderedTaskIds: ids(201) }).success).toBe(false);
    });
});
