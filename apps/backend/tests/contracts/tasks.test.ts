import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { normalizeTaskFilters } from "../../src/domains/tasks/task-filters";
import { buildTaskWhereClause } from "../../src/domains/tasks/tasks.route";

function renderWhereSql(sqlExpression: ReturnType<typeof and>) {
    return new PgDialect().sqlToQuery(sqlExpression!).sql;
}

describe("task route support", () => {
    it("builds a null-project filter for Holding queries", () => {
        const filters = normalizeTaskFilters({
            state: "ACTIVE",
            hasNoProject: true,
        });

        const sql = renderWhereSql(and(...buildTaskWhereClause("user-1", filters)));
        expect(sql).toContain("\"tasks\".\"project_id\" is null");
    });

    it("builds overdue-plus-today anchor filtering", () => {
        const filters = normalizeTaskFilters({
            state: "ACTIVE",
            effectiveOnOrBeforeDate: "2026-03-09",
        });

        const query = new PgDialect().sqlToQuery(and(...buildTaskWhereClause("user-1", filters))!);
        expect(query.sql).toContain("coalesce(\"tasks\".\"due_date\", \"tasks\".\"scheduled_start\")");
        expect(query.params).toContain("2026-03-09T23:59:59.999Z");
    });

    it("uses normalized range boundaries in list filtering", () => {
        const filters = normalizeTaskFilters({
            scheduledRangeStart: "2026-03-01",
            scheduledRangeEnd: "2026-03-31",
        });

        const query = new PgDialect().sqlToQuery(and(...buildTaskWhereClause("user-1", filters))!);
        expect(query.params).toContain("2026-03-01T00:00:00.000Z");
        expect(query.params).toContain("2026-03-31T23:59:59.999Z");
    });
});
