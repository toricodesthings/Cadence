import { describe, expect, it } from "vitest";
import { budgetOpen, groupIsSettled, referenceMinutes, shouldAsk } from "@cadence/domain/duration-ask";

const none = { minutes: [], newestDaysAgo: null };

describe("budget", () => {
    it("allows one shown ask a day, and backs off as they go unanswered", () => {
        expect(budgetOpen(null, "2026-10-14")).toBe(true);
        expect(budgetOpen({ lastOn: "2026-10-14", misses: 0 }, "2026-10-14")).toBe(false);
        expect(budgetOpen({ lastOn: "2026-10-13", misses: 2 }, "2026-10-14")).toBe(true);
        expect(budgetOpen({ lastOn: "2026-10-12", misses: 3 }, "2026-10-14")).toBe(false);
        expect(budgetOpen({ lastOn: "2026-10-11", misses: 3 }, "2026-10-14")).toBe(true);
        expect(budgetOpen({ lastOn: "2026-10-10", misses: 6 }, "2026-10-14")).toBe(false);
        expect(budgetOpen({ lastOn: "2026-10-07", misses: 6 }, "2026-10-14")).toBe(true);
    });
});

describe("settled groups", () => {
    it("are 3+ reports within ±35% of the median and recent", () => {
        expect(groupIsSettled({ minutes: [40, 45, 50], newestDaysAgo: 3 })).toBe(true);
        expect(groupIsSettled({ minutes: [20, 45, 90], newestDaysAgo: 3 })).toBe(false);
        expect(groupIsSettled({ minutes: [40, 45], newestDaysAgo: 3 })).toBe(false);
        expect(groupIsSettled({ minutes: [40, 45, 50], newestDaysAgo: 31 })).toBe(false);
    });
});

describe("shouldAsk", () => {
    const base = { state: null, today: "2026-10-14", ageMs: 60 * 60_000, history: none };
    it("asks about real work, never a done list written down", () => {
        expect(shouldAsk(base)).toBe(true);
        expect(shouldAsk({ ...base, ageMs: 90_000 })).toBe(false);
        expect(shouldAsk({ ...base, state: { lastOn: "2026-10-14", misses: 0 } })).toBe(false);
        expect(shouldAsk({ ...base, history: { minutes: [40, 45, 50], newestDaysAgo: 2 } })).toBe(false);
    });
});

describe("referenceMinutes", () => {
    it("prefers the estimate, then the block, then the group's median", () => {
        expect(referenceMinutes({ durationEstimate: 30, blockMinutes: 60 }, none)).toBe(30);
        expect(referenceMinutes({ durationEstimate: null, blockMinutes: 60 }, none)).toBe(60);
        expect(referenceMinutes({ durationEstimate: null, blockMinutes: null }, { minutes: [40, 60], newestDaysAgo: 1 })).toBe(50);
        expect(referenceMinutes({ durationEstimate: null, blockMinutes: null }, none)).toBeNull();
    });
});
