/**
 * §13.1 Acceptance: Ranking reason labels and materiality
 */
import { describe, it, expect } from "vitest";
import {
    getRankingReasonLabel,
    getMaterialRankingLabel,
} from "../../../../app/lib/utils/ranking-reasons";

describe("getRankingReasonLabel", () => {
    it("returns null for empty reasons", () => {
        expect(getRankingReasonLabel([])).toBeNull();
    });

    it("uses the first reason when multiple are provided", () => {
        const label = getRankingReasonLabel(["overdue", "high_priority"]);
        expect(label).toBe("Overdue");
    });
});

describe("getMaterialRankingLabel", () => {
    it("returns null for non-material reasons", () => {
        expect(getMaterialRankingLabel(["due_today"])).toBeNull();
        expect(getMaterialRankingLabel(["due_soon"])).toBeNull();
        expect(getMaterialRankingLabel(["needs_date"])).toBeNull();
        expect(getMaterialRankingLabel(["not_yet"])).toBeNull();
    });

    it("returns a sentence for material reasons", () => {
        for (const reason of ["overdue", "quick_win", "high_priority", "pinned", "scheduled_now", "waiting"] as const) {
            expect(getMaterialRankingLabel([reason])).toMatch(/.{10}/);
        }
    });

    it("picks the first material reason when multiple present", () => {
        const label = getMaterialRankingLabel(["due_today", "overdue", "pinned"]);
        expect(label).toBe("This task is past its due date");
    });

    it("returns null when no reasons are provided", () => {
        expect(getMaterialRankingLabel([])).toBeNull();
    });
});
