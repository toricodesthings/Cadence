import { describe, expect, it } from "vitest";
import { batchRescheduleSchema, insertTaskSchema, taskFiltersSchema, updateTaskSchema } from "../../src/types/task";

describe("task schemas", () => {
    it("accepts date-only schedule ranges", () => {
        expect(
            taskFiltersSchema.parse({
                scheduledRangeStart: "2026-03-01",
                scheduledRangeEnd: "2026-03-31",
                hasNoProject: "true",
                effectiveOnOrBeforeDate: "2026-03-09",
            }),
        ).toEqual({
            scheduledRangeStart: "2026-03-01",
            scheduledRangeEnd: "2026-03-31",
            hasNoProject: true,
            effectiveOnOrBeforeDate: "2026-03-09",
        });
    });

    it("accepts flexible all-day write payloads", () => {
        expect(
            insertTaskSchema.parse({
                title: "Plan 13",
                orderIndex: 1,
                isAllDay: true,
                dueDate: "2026-03-09",
                scheduledEnd: "2026-03-10",
                tagIds: ["11111111-1111-4111-8111-111111111111"],
                nlp: {
                    rawInput: "Plan 13 tomorrow",
                    sourceSurface: "inline_add",
                    dateStyle: "mdy",
                    dismissedEntityIds: [],
                    userOverrides: {},
                },
            }),
        ).toMatchObject({
            dueDate: "2026-03-09",
            scheduledEnd: "2026-03-10",
            tagIds: ["11111111-1111-4111-8111-111111111111"],
            nlp: {
                rawInput: "Plan 13 tomorrow",
                sourceSurface: "inline_add",
                dateStyle: "mdy",
            },
        });
    });

    it("rejects partial schedule range filters", () => {
        expect(() =>
            taskFiltersSchema.parse({
                scheduledRangeStart: "2026-03-01",
            }),
        ).toThrow(/must be provided together/);
    });

    it("rejects inverted schedule ranges", () => {
        expect(() =>
            taskFiltersSchema.parse({
                scheduledRangeStart: "2026-03-31",
                scheduledRangeEnd: "2026-03-01",
            }),
        ).toThrow(/must be on or after/);
    });

    it("accepts flexible batch reschedule payloads", () => {
        expect(
            batchRescheduleSchema.parse({
                taskIds: ["11111111-1111-4111-8111-111111111111"],
                scheduledStart: "2026-03-09",
                isAllDay: true,
            }),
        ).toMatchObject({
            scheduledStart: "2026-03-09",
            isAllDay: true,
        });
    });

    it("does not inject insert defaults into partial task updates", () => {
        expect(
            updateTaskSchema.parse({
                effort: 2,
            }),
        ).toEqual({
            effort: 2,
        });
    });
});
