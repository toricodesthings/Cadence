import { describe, expect, it } from "vitest";
import type { EffortEvidenceRow } from "@cadence/contracts/task";
import { effortName, projectEffortSuggestion, suggestionLabel, suggestionLevels, toEvidence } from "@cadence/domain/effort-evidence";

const row = (id: string, effort: 1 | 2 | 3, chosenAt: string, origin: "manual" | "accepted" = "manual"): EffortEvidenceRow => ({
    id, title: "Class X Lab", projectId: null, effort, origin, chosenAt,
});
const rows = [1, 2, 3, 4].map((n) => row(`00000000-0000-4000-8000-00000000000${n}`, 3, `2026-09-${10 + n}T15:00:00.000Z`));
const base = { title: "Class X Lab", projectId: null, today: "2026-10-06", chosen: undefined, dismissed: false, literal: false, enabled: true, supported: true };

describe("effort evidence", () => {
    it("days a choice in the person's zone and counts a task once", () => {
        const e = toEvidence([row("a", 2, "2026-09-12T02:30:00.000Z"), row("a", 3, "2026-09-13T12:00:00.000Z")], "America/Toronto");
        expect(e).toEqual([expect.objectContaining({ level: 2, day: "2026-09-11" })]);
    });

    it("suggests, and never applies itself", () => {
        const s = projectEffortSuggestion({ ...base, evidence: toEvidence(rows, "America/Toronto") });
        expect(s).toMatchObject({ kind: "level", level: 3 });
        expect(suggestionLabel(s!)).toBe("High");
    });

    it.each([
        ["a chosen level", { chosen: 1 as const }],
        ["a cleared Effort", { chosen: null }],
        ["a dismissal", { dismissed: true }],
        ["keep as written", { literal: true }],
        ["the opt-out", { enabled: false }],
        ["an unsupported surface (routine, yearly event)", { supported: false }],
        ["an empty title", { title: "  " }],
    ])("shows nothing after %s", (_name, patch) => {
        expect(projectEffortSuggestion({ ...base, ...patch, evidence: toEvidence(rows, "America/Toronto") })).toBeNull();
    });

    it("offers both ends of a range and names it", () => {
        const split = [2, 3, 2, 3, 3, 2].map((l, i) => row(`00000000-0000-4000-8000-0000000001${i}`, l as 2 | 3, `2026-09-${10 + i}T15:00:00.000Z`));
        const s = projectEffortSuggestion({ ...base, evidence: toEvidence(split, "America/Toronto") })!;
        expect(suggestionLabel(s)).toBe("Medium–High");
        expect(suggestionLevels(s)).toEqual([2, 3]);
        expect(effortName(1)).toBe("Low");
    });
});
