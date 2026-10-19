// Synthetic people (seeded, so CI is deterministic) run through the planning rules end to end: what gets recorded,
// when a preference is claimed, and when it lets go. The owner replay and field behaviour are checked elsewhere.
import { describe, expect, it } from "vitest";
import type { TimeOfDay } from "@cadence/contracts/planning";
import { atLocal, addDays, type LocalDate } from "@cadence/domain/time";
import { busyBlocks, feasibleBuckets, findTimes, type FindTimeInput } from "@cadence/domain/find-time";
import { learnedPreference, type SlotRecord } from "@cadence/domain/slot-preference";
import { eligibleOffers } from "@cadence/domain/planning-offers";

const zone = "America/Toronto";
const START = "2026-09-01";
const today = (n: number): LocalDate => addDays(START, n);

/** A tiny seeded generator, so a persona is the same every run. */
function rng(seed: number) {
    let state = seed >>> 0;
    return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const block = (day: LocalDate, from: string, to: string) => ({ id: `${day}-${from}`, state: "ACTIVE", scheduledStart: atLocal(day, from, zone), scheduledEnd: atLocal(day, to, zone) });

const inputFor = (day: LocalDate, tasks: ReturnType<typeof block>[]): FindTimeInput => ({
    task: { minutes: 45, notBefore: null, currentStart: null },
    day, zone, now: atLocal(addDays(day, -1), "08:00", zone), timelineStartHour: 7, busy: busyBlocks(tasks, "me"), preferred: [],
});

/** What the server would record for a manual drop: nothing unless another part of the day also had room. */
function record(day: LocalDate, chosen: TimeOfDay, tasks: ReturnType<typeof block>[], suggested = false): SlotRecord | null {
    const feasible = [...new Set([...feasibleBuckets(inputFor(day, tasks)), chosen])];
    return feasible.length < 2 ? null : { chosen, feasible, suggested, saidOn: day, projectId: null };
}

const feasibleOn = (day: LocalDate) => feasibleBuckets(inputFor(day, []));

describe("personas", () => {
    it("always-evening: claims the evening within 8 records on 4 days", () => {
        const records: SlotRecord[] = [];
        let claimedAfter = 0;
        for (let d = 0; d < 6 && !claimedAfter; d++) {
            for (let i = 0; i < 2; i++) records.push(record(today(d), "evening", [])!);
            if (learnedPreference(records, { projectId: null, feasibleToday: feasibleOn(today(d + 1)), today: today(d + 1) })[0] === "evening") claimedAfter = records.length;
        }
        expect(claimedAfter).toBe(8);
        expect(new Set(records.map((r) => r.saidOn)).size).toBe(4);
    });

    it("mixed: never claims a preference", () => {
        const random = rng(7);
        const buckets: TimeOfDay[] = ["morning", "afternoon", "evening"];
        const records = Array.from({ length: 24 }, (_, i) => record(today(i), buckets[Math.floor(random() * 3)], [])!);
        expect(learnedPreference(records, { projectId: null, feasibleToday: feasibleOn(today(30)), today: today(30) })).toEqual([]);
    });

    it("shift worker with one free slot a day: zero records, and Find a time still works", () => {
        const days = Array.from({ length: 14 }, (_, i) => today(i));
        const busy = (day: LocalDate) => [block(day, "06:00", "17:00"), block(day, "19:45", "22:00")];
        const records = days.map((day) => record(day, "evening", busy(day))).filter(Boolean);
        expect(records).toEqual([]);
        expect(findTimes(inputFor(days[0], busy(days[0])))).not.toEqual([]);
    });

    it("never-answers: no record at all still gets earliest-first proposals, and the deterministic offers", () => {
        const [first] = findTimes(inputFor(today(0), []));
        expect(first.start).toBe(atLocal(today(0), "07:00", zone));
        const offers = eligibleOffers(
            [{ id: "t", state: "ACTIVE", waitingOn: null, dueDate: null, notBefore: null, openSteps: 0, fingerprint: "f", movedOn: [today(0), today(1), today(1)] }],
            { today: today(2), declines: [], avoid: [] },
        );
        expect(offers.steps).toEqual(["t"]);
    });

    it("month-away: the preference they had is still theirs when they come back", () => {
        const records = Array.from({ length: 10 }, (_, i) => record(today(i), "evening", [])!);
        const back = today(10 + 30);
        expect(learnedPreference(records, { projectId: null, feasibleToday: feasibleOn(back), today: back })).toEqual(["evening"]);
    });

    it("new job: a lifelong evening person who starts choosing mornings lets go within 3 contradictions", () => {
        const records = Array.from({ length: 10 }, (_, i) => record(today(i), "evening", [])!);
        const at = (n: number) => today(10 + n);
        const verdict = (n: number) => learnedPreference(records, { projectId: null, feasibleToday: feasibleOn(at(n)), today: at(n) })[0] ?? null;
        expect(verdict(0)).toBe("evening");
        let letGoAfter = 0;
        for (let n = 1; n <= 6 && !letGoAfter; n++) {
            records.push(record(at(n), "morning", [])!);
            if (verdict(n) !== "evening") letGoAfter = n;
        }
        expect(letGoAfter).toBeGreaterThan(0);
        expect(letGoAfter).toBeLessThanOrEqual(3);
    });
});
