import { describe, expect, it } from "vitest";
import {
    batchRescheduleSchema,
    batchStateSchema,
    canonicalNlpEnvelopeSchema,
    effortLevelSchema,
    insertTaskSchema,
    reorderTaskSchema,
    taskFiltersSchema,
    taskPrioritySchema,
    taskBatchQuerySchema,
} from "@cadence/contracts/task";

const UUID = "11111111-1111-4111-8111-111111111111";
const ids = (n: number) => Array(n).fill(UUID);

describe("insertTaskSchema", () => {
    it("fills the server defaults on a minimal task", () => {
        expect(insertTaskSchema.parse({ title: "Write spec", orderIndex: 1 })).toEqual({
            title: "Write spec",
            orderIndex: 1,
            state: "ACTIVE",
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
            dueDate: "2026-03-09",
            endDate: "2026-03-10",
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
        ["batch reschedule", batchRescheduleSchema, (n: number) => ({ taskIds: ids(n), date: "2026-03-09" })],
    ] as const)("%s takes 1–50 tasks", (_label, schema, build) => {
        expect(schema.safeParse(build(1)).success).toBe(true);
        expect(schema.safeParse(build(50)).success).toBe(true);
        expect(schema.safeParse(build(0)).success).toBe(false);
        expect(schema.safeParse(build(51)).success).toBe(false);
    });

    it("reschedules to a day or a start, never both", () => {
        expect(batchRescheduleSchema.safeParse({ taskIds: ids(1), date: "2026-03-09" }).success).toBe(true);
        expect(batchRescheduleSchema.safeParse({ taskIds: ids(1), scheduledStart: "2026-03-09T10:00:00-04:00" }).success).toBe(true);
        expect(batchRescheduleSchema.safeParse({ taskIds: ids(1), scheduledStart: "2026-03-09T10:00:00-04:00", date: "2026-03-09" }).success).toBe(false);
        expect(batchRescheduleSchema.safeParse({ taskIds: ids(1), scheduledStart: "2026-03-09" }).success).toBe(false);
        expect(batchRescheduleSchema.safeParse({ taskIds: ids(1) }).success).toBe(false);
    });

    it("reorders up to 200 siblings at once", () => {
        expect(reorderTaskSchema.safeParse({ orderIndex: 1, orderedTaskIds: ids(200) }).success).toBe(true);
        expect(reorderTaskSchema.safeParse({ orderIndex: 1, orderedTaskIds: ids(201) }).success).toBe(false);
    });
});

describe("offline task batch bounds", () => {
    it("accepts up to ten open-list filters and validates the encoded query", () => {
        const queries = Array.from({ length: 10 }, () => ({ state: "ACTIVE", hasNoDate: "true" }));
        expect(taskBatchQuerySchema.parse({ queries: JSON.stringify(queries) }).queries).toEqual(
            queries.map((query) => ({ ...query, hasNoDate: true })),
        );
    });

    it.each([
        [], Array.from({ length: 11 }, () => ({ state: "ACTIVE" })),
        [{}], [{ state: "COMPLETE" }], [{ state: "ARCHIVED" }],
        [{ state: "ACTIVE", limit: 1000 }], [{ state: "ACTIVE", offset: 10 }],
        [{ state: "ACTIVE", userId: UUID }],
        [{ state: "ACTIVE", from: "2026-03-01" }],
        [{ state: "ACTIVE", from: "2026-03-09", to: "2026-03-01" }],
        [{ state: "ACTIVE", from: "2026-03-01", to: "2026-05-01" }],
    ].map((queries) => ({ queries })))("rejects unsupported or unbounded filters $queries", ({ queries }) => {
        expect(taskBatchQuerySchema.safeParse({ queries: JSON.stringify(queries) }).success).toBe(false);
    });

    it("rejects malformed JSON and excessive query text", () => {
        expect(taskBatchQuerySchema.safeParse({ queries: "[broken" }).success).toBe(false);
        expect(taskBatchQuerySchema.safeParse({ queries: " ".repeat(12_001) }).success).toBe(false);
    });
});

describe("taskFiltersSchema", () => {
    it("coerces query strings and keeps day windows as sent", () => {
        expect(
            taskFiltersSchema.parse({ from: "2026-03-01", to: "2026-03-31", hasNoProject: "true", effectiveOnOrBeforeDate: "2026-03-09" }),
        ).toEqual({ from: "2026-03-01", to: "2026-03-31", hasNoProject: true, effectiveOnOrBeforeDate: "2026-03-09" });
    });

    it("requires both ends of a window", () => {
        expect(() => taskFiltersSchema.parse({ from: "2026-03-01" })).toThrow(/must be provided together/);
    });

    it("rejects a window that ends before it starts", () => {
        expect(() => taskFiltersSchema.parse({ from: "2026-03-31", to: "2026-03-01" })).toThrow(/must be on or after/);
    });

    it("rejects instants where a LocalDate belongs", () => {
        expect(taskFiltersSchema.safeParse({ from: "2026-03-09T00:00:00Z", to: "2026-03-09T00:00:00Z" }).success).toBe(false);
    });

    it("accepts a single-day window", () => {
        expect(taskFiltersSchema.safeParse({ from: "2026-03-09", to: "2026-03-09" }).success).toBe(true);
    });
});
