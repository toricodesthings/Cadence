import { describe, expect, it } from "vitest";
import type { TimeOfDay } from "@cadence/contracts/planning";
import { learnedPreference, preferredBuckets, statedPreference, type SlotRecord } from "@cadence/domain/slot-preference";
import { addDays } from "@cadence/domain/time";

const today = "2026-10-20";
const BUCKETS: TimeOfDay[] = ["morning", "afternoon", "evening"];
const rec = (daysAgo: number, chosen: TimeOfDay, over: Partial<SlotRecord> = {}): SlotRecord => ({ chosen, feasible: BUCKETS, suggested: false, saidOn: addDays(today, -daysAgo), projectId: null, ...over });
const evenings = (n: number, over: Partial<SlotRecord> = {}) => Array.from({ length: n }, (_, i) => rec(i + 1, "evening", over));
const opts = { projectId: null, feasibleToday: BUCKETS, today };

describe("learnedPreference", () => {
    it("needs 8 choices on 4 days with enough weight", () => {
        expect(learnedPreference(evenings(7), opts)).toEqual([]);
        expect(learnedPreference(evenings(8), opts)).toEqual(["evening"]);
        // 8 choices all on one day is a single day's mood.
        expect(learnedPreference(Array.from({ length: 8 }, () => rec(1, "evening")), opts)).toEqual([]);
    });

    it("counts a suggested pick for half", () => {
        expect(learnedPreference(evenings(8, { suggested: true }), opts)).toEqual([]);
        expect(learnedPreference(evenings(8).concat(evenings(4, { suggested: true })), opts)).toEqual(["evening"]);
    });

    it("needs ≥ 65% against every bucket that has room today", () => {
        const mixed = [...evenings(6), rec(7, "morning"), rec(8, "morning"), rec(9, "morning"), rec(10, "morning")];
        expect(learnedPreference(mixed, opts)).toEqual([]);
        // Wins only on the buckets compared, not on one that never had room alongside.
        const sparse = evenings(8, { feasible: ["evening", "afternoon"] });
        expect(learnedPreference(sparse, { ...opts, feasibleToday: ["evening", "afternoon", "morning"] })).toEqual([]);
        expect(learnedPreference(sparse, { ...opts, feasibleToday: ["evening", "afternoon"] })).toEqual(["evening"]);
    });

    it("claims nothing when today offers one bucket, or choices form a cycle", () => {
        expect(learnedPreference(evenings(8), { ...opts, feasibleToday: ["evening"] })).toEqual([]);
        const cycle = Array.from({ length: 12 }, (_, i) => {
            const pair: [TimeOfDay, TimeOfDay, TimeOfDay] = [["morning", "afternoon", "evening"], ["afternoon", "evening", "morning"], ["evening", "morning", "afternoon"]][i % 3] as never;
            return rec(i + 1, pair[0], { feasible: [pair[0], pair[1]] });
        });
        expect(learnedPreference(cycle, opts)).toEqual([]);
    });

    it("turns off after 3 of the latest 5 choices go elsewhere, and back after 5 more records", () => {
        const history = [...evenings(8).map((r, i) => ({ ...r, saidOn: addDays(today, -(20 - i)) }))];
        const contradict = (n: number, from: number) => Array.from({ length: n }, (_, i) => rec(from - i, "morning"));
        const drifted = [...history, ...contradict(3, 11)];
        expect(learnedPreference(drifted, opts)).toEqual([]);
        const later = [...drifted, ...Array.from({ length: 5 }, (_, i) => rec(7 - i, "evening"))];
        expect(learnedPreference(later, opts)).toEqual(["evening"]);
    });

    it("uses the list's own choices when it has enough, else everyone's", () => {
        const all = [...evenings(8, { projectId: "A" }), ...Array.from({ length: 8 }, (_, i) => rec(i + 1, "morning", { projectId: "B" }))];
        expect(learnedPreference(all, { ...opts, projectId: "B" })).toEqual(["morning"]);
        expect(learnedPreference(all, { ...opts, projectId: "C" })).toEqual([]);
    });
});

describe("stated preference", () => {
    const stated = [
        { buckets: ["morning"] as TimeOfDay[], about: "gym" },
        { buckets: ["evening"] as TimeOfDay[], about: "study" },
        { buckets: ["afternoon"] as TimeOfDay[], about: null },
    ];
    it("applies by topic (a shared word or the list's name) or to everything, newest first, at once", () => {
        expect(statedPreference(stated, { title: "Study for stats", listName: null })).toEqual(["evening"]);
        expect(statedPreference(stated, { title: "Pay rent", listName: null })).toEqual(["afternoon"]);
        expect(statedPreference(stated.slice(0, 1), { title: "Pay rent", listName: "Gym" })).toEqual(["morning"]);
        expect(statedPreference(stated.slice(0, 2), { title: "Pay rent", listName: null })).toEqual([]);
    });
    it("beats anything learned", () => {
        expect(preferredBuckets({ records: evenings(8), stated: [{ buckets: ["morning"], about: null }] }, { title: "x", projectId: null, listName: null }, BUCKETS, today)).toEqual(["morning"]);
        expect(preferredBuckets({ records: evenings(8), stated: [] }, { title: "x", projectId: null, listName: null }, BUCKETS, today)).toEqual(["evening"]);
    });
});
