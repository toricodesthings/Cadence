import { describe, expect, it } from "vitest";
import {
    ORDER_INDEX_GAP,
    computeNextOrderIndex,
    computeMidpointIndex,
    reorderWrites,
    computeGappedOrderIndex,
} from "@cadence/domain/ordering";

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

    describe("reorderWrites", () => {
        const items = (...orders: number[]) => orders.map((order, i) => ({ id: String.fromCharCode(97 + i), order }));

        it("writes one midpoint when the neighbours leave room", () => {
            expect(reorderWrites(items(1, 2, 3), "c", 1)).toEqual([{ id: "c", order: 1.5 }]);
        });

        it("steps off the end for a move to the first or last place", () => {
            expect(reorderWrites(items(1, 2, 3), "c", 0)).toEqual([{ id: "c", order: 0 }]);
            expect(reorderWrites(items(1, 2, 3), "a", 2)).toEqual([{ id: "a", order: 4 }]);
        });

        it("lays the list out again when neighbours tie", () => {
            expect(reorderWrites(items(5, 5, 5), "c", 1)).toEqual([
                { id: "a", order: 1024 }, { id: "c", order: 2048 }, { id: "b", order: 3072 },
            ]);
        });

        it("writes nothing for a no-op or an unknown place", () => {
            expect(reorderWrites(items(1, 2), "a", 0)).toEqual([]);
            expect(reorderWrites(items(1, 2), "a", 5)).toEqual([]);
            expect(reorderWrites(items(1, 2), "x", 0)).toEqual([]);
        });
    });
});
