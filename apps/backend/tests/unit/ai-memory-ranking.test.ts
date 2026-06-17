import { describe, expect, it } from "vitest";
import { rankMemories } from "../../src/domains/ai/memory/memory-retrieval";
import { computeDedupeHash } from "../../src/domains/ai/memory/memory-write";

type Candidate = {
    id: string;
    content: string;
    type: "CORE" | "EPHEMERAL";
    salience: number;
    distance: number;
};

const opts = { k: 6, distanceThreshold: 0.45, coreSalienceFloor: 0.5 };

describe("rankMemories", () => {
    it("drops candidates beyond the distance threshold", () => {
        const candidates: Candidate[] = [
            { id: "near", content: "near", type: "EPHEMERAL", salience: 0.5, distance: 0.1 },
            { id: "far", content: "far", type: "EPHEMERAL", salience: 0.9, distance: 0.9 },
        ];
        const result = rankMemories(candidates, opts);
        expect(result.map((m) => m.id)).toEqual(["near"]);
    });

    it("always includes CORE memories above the salience floor even when far", () => {
        const candidates: Candidate[] = [
            { id: "core-far", content: "stable fact", type: "CORE", salience: 0.8, distance: 0.99 },
            { id: "eph-near", content: "transient", type: "EPHEMERAL", salience: 0.5, distance: 0.2 },
        ];
        const result = rankMemories(candidates, opts);
        expect(result.map((m) => m.id).sort()).toEqual(["core-far", "eph-near"]);
    });

    it("does NOT force-include CORE below the salience floor when far", () => {
        const candidates: Candidate[] = [
            { id: "core-weak-far", content: "weak", type: "CORE", salience: 0.3, distance: 0.9 },
        ];
        const result = rankMemories(candidates, opts);
        expect(result).toHaveLength(0);
    });

    it("respects the k cap", () => {
        const candidates: Candidate[] = Array.from({ length: 10 }, (_, i) => ({
            id: `m${i}`,
            content: `c${i}`,
            type: "EPHEMERAL" as const,
            salience: 0.5,
            distance: 0.01 * i,
        }));
        const result = rankMemories(candidates, { ...opts, k: 3 });
        expect(result).toHaveLength(3);
        expect(result.map((m) => m.id)).toEqual(["m0", "m1", "m2"]);
    });

    it("sorts by distance ascending, then salience descending", () => {
        const candidates: Candidate[] = [
            { id: "a", content: "a", type: "EPHEMERAL", salience: 0.4, distance: 0.2 },
            { id: "b", content: "b", type: "EPHEMERAL", salience: 0.9, distance: 0.2 },
            { id: "c", content: "c", type: "EPHEMERAL", salience: 0.5, distance: 0.1 },
        ];
        const result = rankMemories(candidates, opts);
        // c (smallest distance) first; then b before a (same distance, higher salience).
        expect(result.map((m) => m.id)).toEqual(["c", "b", "a"]);
    });

    it("de-dupes by id, keeping the nearest distance", () => {
        const candidates: Candidate[] = [
            { id: "dup", content: "dup", type: "CORE", salience: 0.8, distance: 0.4 },
            { id: "dup", content: "dup", type: "CORE", salience: 0.8, distance: 0.05 },
            { id: "other", content: "other", type: "EPHEMERAL", salience: 0.5, distance: 0.3 },
        ];
        const result = rankMemories(candidates, opts);
        expect(result.filter((m) => m.id === "dup")).toHaveLength(1);
        // The deduped "dup" took the 0.05 distance, so it sorts first.
        expect(result[0].id).toEqual("dup");
    });

    it("returns empty when no candidates qualify", () => {
        expect(rankMemories([], opts)).toEqual([]);
    });
});

describe("computeDedupeHash", () => {
    it("is deterministic for identical input", () => {
        expect(computeDedupeHash("uses 25-min pomodoro")).toEqual(
            computeDedupeHash("uses 25-min pomodoro"),
        );
    });

    it("normalizes case and whitespace", () => {
        const base = computeDedupeHash("Uses 25-min Pomodoro");
        expect(computeDedupeHash("uses 25-min pomodoro")).toEqual(base);
        expect(computeDedupeHash("  uses   25-min\tpomodoro  ")).toEqual(base);
        expect(computeDedupeHash("uses 25-min pomodoro\n")).toEqual(base);
    });

    it("differs for different content", () => {
        expect(computeDedupeHash("has ADHD")).not.toEqual(
            computeDedupeHash("uses 25-min pomodoro"),
        );
    });

    it("produces a stable hex string", () => {
        const hash = computeDedupeHash("has ADHD");
        expect(hash).toMatch(/^[0-9a-f]+$/);
    });
});
