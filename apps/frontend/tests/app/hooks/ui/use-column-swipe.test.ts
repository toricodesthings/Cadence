import { describe, expect, it } from "vitest";
import { swipeDirection } from "../../../../app/hooks/ui/use-column-swipe";

describe("swipeDirection", () => {
    it("left is next, right is previous", () => {
        expect(swipeDirection(-80, 5, 400)).toBe(1);
        expect(swipeDirection(80, 5, 400)).toBe(-1);
    });
    it("ignores short drags unless flicked", () => {
        expect(swipeDirection(-40, 0, 400)).toBe(0);
        expect(swipeDirection(-40, 0, 50)).toBe(1);
    });
    it("leaves a mostly vertical scroll alone", () => expect(swipeDirection(-90, 70, 300)).toBe(0));
});
