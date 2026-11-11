import { describe, expect, it } from "vitest";
import { rubberBand, settleDirection } from "../../../../app/hooks/ui/use-column-swipe";

describe("settleDirection", () => {
    it("past a third of the width turns the page: left is next, right is previous", () => {
        expect(settleDirection(-150, 0, 390)).toBe(1);
        expect(settleDirection(150, 0, 390)).toBe(-1);
    });
    it("a short slow drag springs back, a short flick turns", () => {
        expect(settleDirection(-60, 0.1, 390)).toBe(0);
        expect(settleDirection(-40, -0.8, 390)).toBe(1);
    });
    it("a flick back against the drag springs back", () => expect(settleDirection(-60, 0.8, 390)).toBe(0));
});

describe("rubberBand", () => {
    it("resists more the further it's pulled, never past the width", () => {
        expect(Math.abs(rubberBand(-100, 390))).toBeLessThan(100);
        expect(rubberBand(5000, 390)).toBeLessThan(390);
        expect(rubberBand(-50, 390)).toBeLessThan(0);
    });
});
