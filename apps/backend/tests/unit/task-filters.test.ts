import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { taskFiltersSchema } from "@cadence/contracts/task";
import { buildTaskWhereClause } from "../../src/domains/tasks/tasks.read";

/** Render the WHERE clause the list route would run for these query filters. */
function whereFor(filters: Parameters<typeof buildTaskWhereClause>[1], zone = "America/Toronto") {
    return new PgDialect().sqlToQuery(and(...buildTaskWhereClause("user-1", filters, zone))!);
}

describe("task list query validation", () => {
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

describe("task list filtering", () => {
    it("filters Holding to tasks with no project", () => {
        expect(whereFor({ state: "ACTIVE", hasNoProject: true }).sql).toContain('"tasks"."project_id" is null');
    });

    it("anchors overdue-plus-today on the due day, or the start for timed tasks, bounded by the user's local day", () => {
        const query = whereFor({ state: "ACTIVE", effectiveOnOrBeforeDate: "2026-03-09" });

        expect(query.sql).toContain('"tasks"."due_on" <=');
        expect(query.params).toContain("2026-03-09");
        // Toronto is UTC-4 on 2026-03-10 (DST began 03-08): start of the next local day.
        expect(query.params).toContain("2026-03-10T04:00:00.000Z");
    });

    it("turns a day window into instant bounds in the user's zone, and day bounds for all-day tasks", () => {
        const toronto = whereFor({ from: "2026-03-01", to: "2026-03-31" });
        expect(toronto.params).toContain("2026-03-01");
        expect(toronto.params).toContain("2026-03-31");
        expect(toronto.params).toContain("2026-03-01T05:00:00.000Z");
        expect(toronto.params).toContain("2026-04-01T04:00:00.000Z");

        const kiritimati = whereFor({ from: "2026-03-01", to: "2026-03-31" }, "Pacific/Kiritimati");
        expect(kiritimati.params).toContain("2026-02-28T10:00:00.000Z");
    });

    it("always scopes to the caller", () => {
        expect(whereFor({}).params).toContain("user-1");
    });
});
