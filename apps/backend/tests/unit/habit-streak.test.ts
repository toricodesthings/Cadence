import { describe, expect, it } from "vitest";
import { rrulestr } from "rrule";
import { computeCurrentStreak, scanStreak } from "../../src/domains/habits/habits.service";

function occurrences(recurrenceRule: string, createdAt: string, asOf: string): string[] {
    const dtstart = new Date(`${createdAt}T00:00:00.000Z`);
    const rule = rrulestr(recurrenceRule, { dtstart });
    return rule.between(dtstart, new Date(`${asOf}T23:59:59.999Z`), true).map((d) => d.toISOString().substring(0, 10));
}

function done(completed: Iterable<string>, skipped: Iterable<string> = []) {
    return new Map<string, "COMPLETED" | "SKIPPED">([
        ...[...skipped].map((d) => [d, "SKIPPED"] as const),
        ...[...completed].map((d) => [d, "COMPLETED"] as const),
    ]);
}

function lookup(completed: Iterable<string>, skipped: Iterable<string> = []) {
    const map = done(completed, skipped);
    return async (dates: string[]) => new Map(dates.filter((d) => map.has(d)).map((d) => [d, map.get(d)!]));
}

describe("scanStreak (pure reducer)", () => {
    const init = { streak: 0, runStarted: false };

    it("counts a fully completed window", () => {
        const r = scanStreak(["d3", "d2", "d1"], done(["d3", "d2", "d1"]), init, "d3");
        expect(r.streak).toBe(3);
        expect(r.terminated).toBe(false);
    });

    it("grants grace only to today", () => {
        const r = scanStreak(["d3", "d2", "d1"], done(["d2", "d1"]), init, "d3");
        expect(r.streak).toBe(2);
    });

    it("a missed day before the run ends it at 0", () => {
        const r = scanStreak(["d4", "d3", "d2", "d1"], done(["d2", "d1"]), init, "d4");
        expect(r.streak).toBe(0);
        expect(r.terminated).toBe(true);
    });

    it("terminates at the first gap after the run has started", () => {
        const r = scanStreak(["d3", "d2", "d1"], done(["d3", "d1"]), init, "d3");
        expect(r.streak).toBe(1);
        expect(r.terminated).toBe(true);
    });

    it("treats a skipped day as neutral: done, skip, done is a run of 2", () => {
        const r = scanStreak(["d3", "d2", "d1", "d0"], done(["d3", "d1"], ["d2"]), init, "d3");
        expect(r.streak).toBe(2);
        expect(r.terminated).toBe(true);
    });
});

describe("computeCurrentStreak (live definition)", () => {
    it("posture: done, done, missed, missed, open today is 0", async () => {
        const streak = await computeCurrentStreak(
            "FREQ=DAILY",
            "2026-11-14",
            "2026-11-23",
            lookup(["2026-11-19", "2026-11-20"]),
        );
        expect(streak).toBe(0);
    });

    it("counts four straight days with today still open", async () => {
        const days = ["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
        expect(await computeCurrentStreak("FREQ=DAILY", "2026-11-14", "2026-11-23", lookup(days))).toBe(4);
    });

    it("counts only due days: a missed due day cuts the run", async () => {
        const streak = await computeCurrentStreak(
            "FREQ=WEEKLY;BYDAY=TU,TH,SA,SU",
            "2026-11-01",
            "2026-11-23",
            lookup(["2026-11-17", "2026-11-19", "2026-11-22"]),
        );
        expect(streak).toBe(1);
    });
});

describe("computeCurrentStreak (cadence-agnostic, bounded)", () => {
    it.each([
        ["MONTHLY (gaps over 7 days)", "FREQ=MONTHLY", "2025-01-15", "2026-06-15"],
        ["bi-weekly", "FREQ=WEEKLY;INTERVAL=2", "2026-01-05", "2026-06-01"],
    ])("builds a multi-step streak for %s habits", async (_name, rule, created, asOf) => {
        const occ = occurrences(rule, created, asOf);
        expect(occ.length).toBeGreaterThan(1);

        const streak = await computeCurrentStreak(rule, created, asOf, lookup(occ));
        expect(streak).toBe(occ.length);
    });

    it("counts long daily streaks across multiple fetch batches", async () => {
        const created = "2026-01-01";
        const asOf = "2026-04-10";
        const occ = occurrences("FREQ=DAILY", created, asOf);
        expect(occ.length).toBe(100);

        const streak = await computeCurrentStreak("FREQ=DAILY", created, asOf, lookup(occ));
        expect(streak).toBe(100);
    });

    it("preserves the prior run when the most recent occurrence is un-completed", async () => {
        const created = "2025-01-15";
        const asOf = "2026-06-15";
        const occ = occurrences("FREQ=MONTHLY", created, asOf);
        const withoutLatest = occ.slice(0, -1);

        const streak = await computeCurrentStreak("FREQ=MONTHLY", created, asOf, lookup(withoutLatest));
        expect(streak).toBe(occ.length - 1);
    });

    it("stops the streak at a missed occurrence", async () => {
        const created = "2026-01-05";
        const asOf = "2026-06-01";
        const occ = occurrences("FREQ=WEEKLY", created, asOf);
        const completed = occ.filter((d) => d !== occ[occ.length - 3]);

        const streak = await computeCurrentStreak("FREQ=WEEKLY", created, asOf, lookup(completed));
        expect(streak).toBe(2);
    });

    it("reports 0 when there are no completions", async () => {
        const streak = await computeCurrentStreak("FREQ=MONTHLY", "2025-06-01", "2026-06-15", lookup([]));
        expect(streak).toBe(0);
    });

    it.each(["NOT A RULE", "FREQ=SECONDLY", "FREQ=DAILY;BYHOUR=0,1"])(
        "rejects unsafe stored rules explicitly: %s",
        async (rule) => {
            await expect(computeCurrentStreak(rule, "2026-01-01", "2026-06-01", lookup([]))).rejects.toMatchObject({
                code: "INVALID_RECURRENCE_RULE",
            });
        },
    );

    it("preserves yearly and finite-count streaks", async () => {
        const years = ["2024-01-01", "2025-01-01", "2026-01-01"];
        expect(await computeCurrentStreak("FREQ=YEARLY;COUNT=3", "2024-01-01", "2027-01-01", lookup(years))).toBe(3);
        const days = ["2026-01-01", "2026-01-03", "2026-01-05"];
        expect(
            await computeCurrentStreak("FREQ=DAILY;INTERVAL=2;COUNT=3", "2026-01-01", "2026-06-01", lookup(days)),
        ).toBe(3);
    });

    it("reaches days logged before the routine was created", async () => {
        const completed = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"];

        expect(
            await computeCurrentStreak("FREQ=DAILY", "2026-09-23", "2026-09-23", lookup(completed), {
                earliest: "2026-09-20",
            }),
        ).toBe(4);
    });
});
