import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { normalizeTaskFilters } from "../../src/domains/tasks/task-filters";
import { buildTaskWhereClause } from "../../src/domains/tasks/tasks.route";

/** Render the WHERE clause the list route would run for these query filters. */
function whereFor(filters: Parameters<typeof normalizeTaskFilters>[0]) {
    return new PgDialect().sqlToQuery(and(...buildTaskWhereClause("user-1", normalizeTaskFilters(filters)))!);
}

describe("task list filtering", () => {
    it("adds the inclusive end-of-day boundary for effectiveOnOrBeforeDate", () => {
        const normalized = normalizeTaskFilters({ effectiveOnOrBeforeDate: "2026-03-09", hasNoProject: true });

        expect(normalized.effectiveOnOrBeforeDateTime).toBe("2026-03-09T23:59:59.999Z");
        expect(normalized.hasNoProject).toBe(true);
    });

    it("filters Holding to tasks with no project", () => {
        expect(whereFor({ state: "ACTIVE", hasNoProject: true }).sql).toContain('"tasks"."project_id" is null');
    });

    it("anchors overdue-plus-today on due date, falling back to scheduled start", () => {
        const query = whereFor({ state: "ACTIVE", effectiveOnOrBeforeDate: "2026-03-09" });

        expect(query.sql).toContain('coalesce("tasks"."due_date", "tasks"."scheduled_start")');
        expect(query.params).toContain("2026-03-09T23:59:59.999Z");
    });

    it("queries date-only schedule ranges with inclusive day boundaries", () => {
        const query = whereFor({ scheduledRangeStart: "2026-03-01", scheduledRangeEnd: "2026-03-31" });

        expect(query.params).toContain("2026-03-01T00:00:00.000Z");
        expect(query.params).toContain("2026-03-31T23:59:59.999Z");
    });

    it("always scopes to the caller", () => {
        expect(whereFor({}).params).toContain("user-1");
    });
});
