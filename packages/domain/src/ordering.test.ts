import { describe, expect, it } from "vitest";
import {
    ORDER_INDEX_GAP,
    computeNextOrderIndex,
    computeMidpointIndex,
    computeGappedOrderIndex,
} from "./ordering";

describe("ordering math", () => {
    it("appends past the max (1 when empty)", () => {
        expect(computeNextOrderIndex([])).toBe(1);
        expect(computeNextOrderIndex([3, 1, 2])).toBe(4);
    });

    it("takes the midpoint between two neighbours", () => {
        expect(computeMidpointIndex(2, 4, 0)).toBe(3);
    });

    it("steps off a single neighbour and falls back when isolated", () => {
        expect(computeMidpointIndex(5, undefined, 0)).toBe(6);
        expect(computeMidpointIndex(undefined, 5, 0)).toBe(4);
        expect(computeMidpointIndex(undefined, undefined, 42)).toBe(42);
    });

    it("lays out a full rebalance on an even gap", () => {
        expect(computeGappedOrderIndex(0)).toBe(0);
        expect(computeGappedOrderIndex(3)).toBe(3 * ORDER_INDEX_GAP);
    });
});
