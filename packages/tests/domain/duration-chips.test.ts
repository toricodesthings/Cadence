import { describe, expect, it } from "vitest";
import { ABSOLUTE_CHIPS, formatMinutes, parseAnswer, relativeChips } from "@cadence/domain/duration-chips";

describe("duration chips", () => {
    it("formats lengths", () => {
        expect([5, 45, 60, 90, 120].map(formatMinutes)).toEqual(["5 min", "45 min", "1 hr", "1 hr 30 min", "2 hr"]);
    });

    it("offers at most six absolute steps, each a real length", () => {
        expect(ABSOLUTE_CHIPS.map((c) => c.minutes)).toEqual([5, 15, 30, 60, 120]);
    });

    it("scales a reference to 5 minutes, on the right side, with no repeats", () => {
        expect(relativeChips(45, "shorter").map((c) => c.minutes)).toEqual([10, 25, 35]);
        expect(relativeChips(45, "longer").map((c) => c.minutes)).toEqual([70, 90, 135]);
        // 10 min: ¼ and ½ both round to the floor or collide, never equal or above the reference.
        const small = relativeChips(10, "shorter").map((c) => c.minutes);
        expect(small.every((m) => m < 10)).toBe(true);
        expect(new Set(small).size).toBe(small.length);
        expect(relativeChips(5, "shorter")).toEqual([]);
    });

    it("reads the Other field", () => {
        expect(parseAnswer("90")).toBe(90);
        expect(parseAnswer("1h20")).toBe(80);
        expect(parseAnswer("45 min")).toBe(45);
        expect(parseAnswer("an hour and a half")).toBe(90);
        expect(parseAnswer("soon")).toBeNull();
        expect(parseAnswer("0")).toBeNull();
        expect(parseAnswer("99999")).toBeNull();
    });
});
