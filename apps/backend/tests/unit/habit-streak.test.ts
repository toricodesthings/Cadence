import { describe, expect, it } from "vitest";
import { rrulestr } from "rrule";
import { computeCurrentStreak, scanStreak } from "../../src/domains/habits/habits.route";

/** Expand all occurrence date-strings for a rule between creation and `asOf`, ascending. */
function occurrences(recurrenceRule: string, createdAt: string, asOf: string): string[] {
    const dtstart = new Date(`${createdAt}T00:00:00.000Z`);
    const rule = rrulestr(recurrenceRule, { dtstart });
    return rule
        .between(dtstart, new Date(`${asOf}T23:59:59.999Z`), true)
        .map((d) => d.toISOString().substring(0, 10));
}

/** Build a `loadCompleted` lookup backed by an in-memory set of completed dates. */
function lookup(completed: Iterable<string>) {
    const set = new Set(completed);
    return async (dates: string[]) => new Set(dates.filter((d) => set.has(d)));
}

describe("scanStreak (pure reducer)", () => {
    const init = { streak: 0, runStarted: false, leadingGap: 0 };

    it("counts a fully completed window", () => {
        const r = scanStreak(["d3", "d2", "d1"], new Set(["d3", "d2", "d1"]), init);
        expect(r.streak).toBe(3);
        expect(r.terminated).toBe(false);
    });

    it("grants grace to trailing unresolved occurrences before the run starts", () => {
        // d3 (newest) not yet resolved; the run d2..d1 is preserved.
        const r = scanStreak(["d3", "d2", "d1"], new Set(["d2", "d1"]), init);
        expect(r.streak).toBe(2);
    });

    it("terminates at the first gap after the run has started", () => {
        const r = scanStreak(["d3", "d2", "d1"], new Set(["d3", "d1"]), init);
        expect(r.streak).toBe(1);
        expect(r.terminated).toBe(true);
    });

    it("returns 0 once the leading-gap limit is reached with no completion", () => {
        const r = scanStreak(["a", "b"], new Set<string>(), init, 2);
        expect(r.streak).toBe(0);
        expect(r.terminated).toBe(true);
    });
});

describe("computeCurrentStreak (cadence-agnostic, bounded)", () => {
    it("builds a multi-step streak for MONTHLY habits (>7-day gaps)", async () => {
        const created = "2025-01-15";
        const asOf = "2026-06-15";
        const occ = occurrences("FREQ=MONTHLY", created, asOf);
        expect(occ.length).toBeGreaterThan(1); // sanity: spans many months

        const streak = await computeCurrentStreak("FREQ=MONTHLY", created, asOf, lookup(occ));
        expect(streak).toBe(occ.length); // every occurrence completed → full streak
    });

    it("builds a multi-step streak for bi-weekly habits", async () => {
        const created = "2026-01-05";
        const asOf = "2026-06-01";
        const occ = occurrences("FREQ=WEEKLY;INTERVAL=2", created, asOf);
        expect(occ.length).toBeGreaterThan(1);

        const streak = await computeCurrentStreak("FREQ=WEEKLY;INTERVAL=2", created, asOf, lookup(occ));
        expect(streak).toBe(occ.length);
    });

    it("counts long daily streaks across multiple fetch batches", async () => {
        const created = "2026-01-01";
        const asOf = "2026-04-10"; // 100 days inclusive
        const occ = occurrences("FREQ=DAILY", created, asOf);
        expect(occ.length).toBe(100);

        const streak = await computeCurrentStreak("FREQ=DAILY", created, asOf, lookup(occ));
        expect(streak).toBe(100);
    });

    it("preserves the prior run when the most recent occurrence is un-completed", async () => {
        // Simulates the user clearing today's completion: the latest occurrence is
        // no longer in the completed set. The streak must reflect the prior run,
        // not collapse to 0.
        const created = "2025-01-15";
        const asOf = "2026-06-15";
        const occ = occurrences("FREQ=MONTHLY", created, asOf);
        const withoutLatest = occ.slice(0, -1); // drop the most recent occurrence

        const streak = await computeCurrentStreak("FREQ=MONTHLY", created, asOf, lookup(withoutLatest));
        expect(streak).toBe(occ.length - 1);
    });

    it("stops the streak at a missed occurrence", async () => {
        const created = "2026-01-05";
        const asOf = "2026-06-01";
        const occ = occurrences("FREQ=WEEKLY", created, asOf);
        // Miss the 3rd-most-recent occurrence; only the two newest count.
        const completed = occ.filter((d) => d !== occ[occ.length - 3]);

        const streak = await computeCurrentStreak("FREQ=WEEKLY", created, asOf, lookup(completed));
        expect(streak).toBe(2);
    });

    it("reports 0 when there are no completions", async () => {
        const streak = await computeCurrentStreak("FREQ=MONTHLY", "2025-06-01", "2026-06-15", lookup([]));
        expect(streak).toBe(0);
    });

    it("returns 0 for an invalid recurrence rule instead of throwing", async () => {
        const streak = await computeCurrentStreak("NOT A RULE", "2026-01-01", "2026-06-01", lookup([]));
        expect(streak).toBe(0);
    });
});
