import { describe, expect, it } from "vitest";
import { suggestEffort, meaningOf, type EffortEvidence, type EffortLevel } from "@cadence/nlp/effort";
import { addDaysLocal } from "@cadence/nlp/core";

const TODAY = "2026-10-06";
const ago = (days: number) => addDaysLocal(TODAY, -days);
const ev = (title: string, level: EffortLevel, daysAgo: number, extra: Partial<EffortEvidence> = {}): EffortEvidence => ({
    title, projectId: null, level, origin: "manual", day: ago(daysAgo), ...extra,
});
const labs = (levels: EffortLevel[]) => levels.map((l, i) => ev(`Class X Lab ${i + 1}`, l, 7 * (i + 1)));

describe("meaningOf", () => {
    it("ignores filler, case, punctuation and numbering", () => {
        expect([...meaningOf("Class X — Lab #3!")].sort()).toEqual(["class", "lab", "x"]);
        expect(meaningOf("Lab 3")).toEqual(meaningOf("lab 4"));
    });
});

describe("suggestEffort", () => {
    it("suggests one level when a person has chosen it consistently", () => {
        expect(suggestEffort("Class X Lab", null, labs([3, 3, 3, 3]), TODAY)).toMatchObject({ kind: "level", level: 3 });
    });
    it("suggests a bounded range when choices split between neighbours", () => {
        expect(suggestEffort("Class X Lab", null, labs([2, 3, 2, 3, 3, 2]), TODAY)).toMatchObject({ kind: "range", low: 2, high: 3 });
    });
    it("is personal: another person's Low history gives Low", () => {
        expect(suggestEffort("Class X Lab", null, labs([1, 1, 1, 1]), TODAY)).toMatchObject({ kind: "level", level: 1 });
    });
    it("abstains with no history, sparse history, or contradictory history", () => {
        expect(suggestEffort("Class X Lab", null, [], TODAY)).toBeNull();
        expect(suggestEffort("Class X Lab", null, labs([3]), TODAY)).toBeNull();
        expect(suggestEffort("Class X Lab", null, labs([1, 3, 1, 3, 1, 3]), TODAY)).toBeNull();
    });
    it("does not carry a lab's effort to another class or to a lecture", () => {
        const history = labs([3, 3, 3, 3]);
        expect(suggestEffort("Class Y Lab", null, history, TODAY)).toBeNull();
        expect(suggestEffort("Class X Lecture", null, history, TODAY)).toBeNull();
        expect(suggestEffort("Lab", null, history, TODAY)).toBeNull();
    });
    it("keeps lists apart", () => {
        const history = labs([3, 3, 3, 3]).map((e) => ({ ...e, projectId: "course-x" }));
        expect(suggestEffort("Class X Lab", "course-y", history, TODAY)).toBeNull();
        expect(suggestEffort("Class X Lab", "course-x", history, TODAY)).not.toBeNull();
        expect(suggestEffort("Class X Lab", null, history, TODAY)).not.toBeNull();
    });
    it("lets recent choices outweigh old ones, and drops evidence over a year old", () => {
        const drift = [...[3, 3, 3, 3].map((l, i) => ev("Class X Lab", l as EffortLevel, 300 + i)), ...[1, 1, 1].map((l, i) => ev("Class X Lab", l as EffortLevel, 5 + i))];
        expect(suggestEffort("Class X Lab", null, drift, TODAY)).toMatchObject({ level: 1 });
        expect(suggestEffort("Class X Lab", null, [3, 3, 3, 3].map((l, i) => ev("Class X Lab", l as EffortLevel, 400 + i)), TODAY)).toBeNull();
    });
    it("counts an accepted suggestion for less than a direct choice", () => {
        const few = [3, 3, 3].map((l, i) => ev("Class X Lab", l as EffortLevel, 7 + i, { origin: "accepted" }));
        expect(suggestEffort("Class X Lab", null, few, TODAY)).toBeNull(); // agreeing three times is not yet evidence
        const accepted = [3, 3, 3, 3, 3].map((l, i) => ev("Class X Lab", l as EffortLevel, 7 + i, { origin: "accepted" }));
        expect(suggestEffort("Class X Lab", null, accepted, TODAY)).toMatchObject({ level: 3 });
        const mixed = [...accepted, ...[1, 1, 1].map((l, i) => ev("Class X Lab", l as EffortLevel, 7 + i))];
        expect(suggestEffort("Class X Lab", null, mixed, TODAY)).not.toMatchObject({ kind: "level", level: 3 });
    });
    it("is deterministic and ignores future-dated evidence", () => {
        const h = [...labs([3, 3, 3, 3]), ev("Class X Lab", 1, -3)];
        expect(suggestEffort("Class X Lab", null, h, TODAY)).toEqual(suggestEffort("Class X Lab", null, h, TODAY));
        expect(suggestEffort("Class X Lab", null, h, TODAY)).toMatchObject({ level: 3 });
    });
});

/** Synthetic users with chronological holdouts: only earlier choices may inform a later one. */
describe("evaluation against a modal baseline", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = (preferred: EffortLevel): EffortLevel => {
        const r = rand();
        if (r < 0.8) return preferred;
        const neighbour = (preferred === 2 ? (rand() < 0.5 ? 1 : 3) : preferred === 1 ? 2 : 2) as EffortLevel;
        return r < 0.95 ? neighbour : (preferred === 3 ? 1 : 3);
    };

    it("beats the user's historical mode where they overlap, and abstains where it cannot know", () => {
        let covered = 0, total = 0, mine = 0, baseline = 0, hits = 0;
        for (let user = 0; user < 40; user++) {
            const before = (1 + Math.floor(rand() * 3)) as EffortLevel;
            const after = (rand() < 0.5 ? before : ((1 + Math.floor(rand() * 3)) as EffortLevel)); // some people change
            const course = `Course${user}`;
            const rows: EffortEvidence[] = [];
            for (let i = 0; i < 12; i++) {
                const preferred = i < 8 ? before : after;
                rows.push(ev(`${course} Lab ${i}`, pick(preferred), (12 - i) * 20));
            }
            for (let t = 8; t < 12; t++) {
                const history = rows.slice(0, t);
                const today = rows[t].day;
                const truth = rows[t].level;
                total++;
                const s = suggestEffort(`${course} Lab`, null, history, today);
                if (!s) continue;
                covered++;
                const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
                for (const h of history) counts[h.level]++;
                const mode = ([1, 2, 3] as EffortLevel[]).reduce((a, b) => (counts[b] > counts[a] ? b : a));
                const hit = s.kind === "level" ? s.level === truth : truth >= s.low && truth <= s.high;
                if (hit) mine++;
                if (mode === truth) baseline++;
                if (s.kind === "level" && s.level === truth) hits++;
            }
        }
        // Gates are set from the baseline: at least as good where it speaks, and it must speak on most cases but not all.
        expect(covered / total).toBeGreaterThan(0.5);
        expect(covered / total).toBeLessThan(1);
        expect(mine).toBeGreaterThanOrEqual(baseline);
        expect(hits).toBeGreaterThan(0);
    });
});
