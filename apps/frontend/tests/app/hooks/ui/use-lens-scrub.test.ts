import { describe, expect, it } from "vitest";
import { clampLens, nearestIndex } from "../../../../app/hooks/ui/use-lens-scrub";

const items = [{ left: 0, width: 60 }, { left: 60, width: 60 }, { left: 180, width: 60 }];
const orb = [{ left: 120, width: 60 }];

describe("nearestIndex", () => {
    it.each([[10, 0], [95, 1], [200, 2], [500, 2], [-20, 0]])("x %d → item %d", (x, i) => expect(nearestIndex(x, items, orb)).toBe(i));
    it("is null over an excluded span", () => expect(nearestIndex(150, items, orb)).toBeNull());
    it("is null with no items", () => expect(nearestIndex(10, [])).toBeNull());
});

describe("clampLens", () => {
    it("centres the lens on the finger", () => expect(clampLens(100, items, 60)).toBe(70));
    it("stops at the first and last item", () => {
        expect(clampLens(5, items, 60)).toBe(0);
        expect(clampLens(400, items, 60)).toBe(180);
    });
});
