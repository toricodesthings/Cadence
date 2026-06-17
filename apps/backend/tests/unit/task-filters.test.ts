import { describe, expect, it } from "vitest";
import { normalizeEndBoundary, normalizeStartBoundary } from "@cadence/domain/task-temporal";
import { normalizeTaskFilters } from "../../src/domains/tasks/task-filters";

describe("task filter normalization", () => {
    it("expands date-only range boundaries to inclusive datetimes", () => {
        expect(normalizeStartBoundary("2026-03-01")).toBe("2026-03-01T00:00:00.000Z");
        expect(normalizeEndBoundary("2026-03-31")).toBe("2026-03-31T23:59:59.999Z");
    });

    it("preserves datetime inputs", () => {
        const iso = "2026-03-01T12:30:00.000Z";
        expect(normalizeStartBoundary(iso)).toBe(iso);
        expect(normalizeEndBoundary(iso)).toBe(iso);
    });

    it("adds the effective on-or-before datetime boundary", () => {
        const normalized = normalizeTaskFilters({
            effectiveOnOrBeforeDate: "2026-03-09",
            hasNoProject: true,
        });

        expect(normalized.effectiveOnOrBeforeDateTime).toBe("2026-03-09T23:59:59.999Z");
        expect(normalized.hasNoProject).toBe(true);
    });
});
