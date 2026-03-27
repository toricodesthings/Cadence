/**
 * §13.1 Acceptance: Ranking reason labels and materiality
 */
import { describe, it, expect } from "vitest";
import type { TaskRankReason } from "@cadence/nlp/ranking";
import {
    getRankingReasonLabel,
    getMaterialRankingLabel,
} from "../../../../app/lib/utils/ranking-reasons";

const ALL_REASONS: TaskRankReason[] = [
    "overdue",
    "due_today",
    "due_soon",
    "quick_win",
    "high_priority",
    "needs_date",
    "waiting",
    "not_yet",
    "pinned",
    "scheduled_now",
];

describe("getRankingReasonLabel", () => {
    it("returns null for empty reasons", () => {
        expect(getRankingReasonLabel([])).toBeNull();
    });

    it("returns a label string for every known reason", () => {
        for (const reason of ALL_REASONS) {
            const label = getRankingReasonLabel([reason]);
            expect(label).toBeDefined();
            expect(typeof label).toBe("string");
            expect(label!.length).toBeGreaterThan(0);
        }
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
        const materialReasons: TaskRankReason[] = [
            "overdue",
            "quick_win",
            "high_priority",
            "pinned",
            "scheduled_now",
            "waiting",
        ];
        for (const reason of materialReasons) {
            const sentence = getMaterialRankingLabel([reason]);
            expect(sentence).toBeDefined();
            expect(typeof sentence).toBe("string");
            expect(sentence!.length).toBeGreaterThan(10); // full sentence
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
