import { describe, expect, it } from "vitest";
import { addDaysLocal } from "@cadence/nlp/core";
import { estimateDuration, roundMinutes, weightedQuantile, type DurationEvidence } from "@cadence/nlp/duration";

const TODAY = "2026-10-17";
const Q = { taskId: null, title: "Lab report", projectId: null };
let n = 0;
const ev = (minutes: number | [number, number], daysAgo: number, extra: Partial<DurationEvidence> = {}): DurationEvidence => {
    const [low, high] = typeof minutes === "number" ? [minutes, minutes] : minutes;
    return { taskId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, title: "Lab report", projectId: null, series: false, low, high, anchored: false, day: addDaysLocal(TODAY, -daysAgo), ...extra };
};

describe("weightedQuantile", () => {
    it("takes the first value whose running weight reaches p", () => {
        expect(weightedQuantile([5, 15], [1, 1], 0.5)).toBe(5);
        expect(weightedQuantile([15, 5], [1, 1], 0.5)).toBe(5);
        expect(weightedQuantile([5, 15], [1, 3], 0.5)).toBe(15);
        expect(weightedQuantile([10, 20, 30], [1, 1, 1], 0.9)).toBe(30);
        expect(weightedQuantile([10, 20, 30], [1, 1, 1], 0.1)).toBe(10);
        expect(weightedQuantile([7], [0.2], 0.5)).toBe(7);
    });
});

describe("roundMinutes", () => {
    it.each([[1, 5], [22, 20], [23, 25], [58, 60], [61, 60], [68, 75], [70, 75], [181, 180], [200, 210], [1500, 1500]])("%i → %i", (m, out) => {
        expect(roundMinutes(m)).toBe(out);
    });
});

describe("estimateDuration (worked examples)", () => {
    it("none → null; one non-identical match → null", () => {
        expect(estimateDuration(Q, [], TODAY)).toBeNull();
        expect(estimateDuration(Q, [ev(30, 3, { title: "Lab notes" })], TODAY)).toBeNull();
        expect(estimateDuration(Q, [ev(30, 3)], TODAY)).toBeNull();
    });
    it("one answer on the same task → tentative", () => {
        const e = ev(50, 3, { series: true });
        expect(estimateDuration({ ...Q, taskId: e.taskId }, [e], TODAY)).toMatchObject({ state: "tentative", minutes: 50 });
    });
    it("45, 50, 60 on two days → supported, about 50", () => {
        const g = estimateDuration(Q, [ev(45, 10), ev(50, 8), ev(60, 8)], TODAY);
        expect(g).toMatchObject({ state: "supported", minutes: 50, reports: 3, days: 2 });
    });
    it("one old wrong tap does not move the median or break support", () => {
        const g = estimateDuration(Q, [ev(45, 10), ev(50, 8), ev(60, 8), ev(5, 330)], TODAY);
        expect(g).toMatchObject({ state: "supported", minutes: 50 });
    });
    it("drift: two much newer answers replace the old ones", () => {
        const g = estimateDuration(Q, [ev(30, 60), ev(35, 50), ev(30, 40), ev(90, 3), ev(100, 1)], TODAY);
        expect(g?.state).toBe("tentative");
        expect(g!.minutes).toBeGreaterThanOrEqual(90);
        expect(g!.minutes).toBeLessThanOrEqual(105);
        expect(g!.reports).toBe(2);
    });
    it("drift works downwards too", () => {
        const g = estimateDuration(Q, [ev(120, 60), ev(100, 50), ev(110, 40), ev(30, 3), ev(35, 1)], TODAY);
        expect(g!.minutes).toBeLessThanOrEqual(35);
    });
    it("only anchored answers are at most tentative", () => {
        const g = estimateDuration(Q, [ev(45, 10, { anchored: true }), ev(50, 8, { anchored: true }), ev(45, 5, { anchored: true })], TODAY);
        expect(g?.state).toBe("tentative");
    });
    it("a range and a point → tentative about 30", () => {
        const g = estimateDuration(Q, [ev([20, 40], 10), ev(30, 8)], TODAY);
        expect(g).toMatchObject({ state: "tentative", minutes: 30 });
    });
    it("a different list is ignored (the Effort rule)", () => {
        const a = "11111111-1111-4111-8111-111111111111";
        const b = "22222222-2222-4222-8222-222222222222";
        const history = [ev(45, 10, { projectId: a }), ev(50, 8, { projectId: a }), ev(60, 8, { projectId: a })];
        expect(estimateDuration({ ...Q, projectId: b }, history, TODAY)).toBeNull();
        expect(estimateDuration({ ...Q, projectId: a }, history, TODAY)?.state).toBe("supported");
    });
    it("answers age: past 60 days nothing is supported, past 90 nothing shows", () => {
        expect(estimateDuration(Q, [ev(45, 70), ev(50, 72), ev(60, 80)], TODAY)?.state).toBe("tentative");
        expect(estimateDuration(Q, [ev(45, 100), ev(50, 102), ev(60, 110)], TODAY)).toBeNull();
        expect(estimateDuration(Q, [ev(45, 400), ev(50, 402), ev(60, 410)], TODAY)).toBeNull();
    });
    it("contradictory answers abstain", () => {
        expect(estimateDuration(Q, [ev(10, 10), ev(120, 8), ev(15, 7), ev(100, 6)], TODAY)).toBeNull();
    });
});
