import { describe, expect, it } from "vitest";
import { ABSOLUTE_CHIPS, formatMinutes, formatValue, parseAnswer, relativeChips } from "@cadence/domain/duration-chips";

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

    it("reads the Other field: lengths up to 24 hours", () => {
        const point = (minutes: number) => ({ kind: "point", minutes });
        expect(parseAnswer("90")).toEqual(point(90));
        expect(parseAnswer("1")).toEqual(point(1));
        expect(parseAnswer("1h20")).toEqual(point(80));
        expect(parseAnswer("1 hour 30 minutes")).toEqual(point(90));
        expect(parseAnswer("1h 30")).toEqual(point(90));
        expect(parseAnswer("2 hrs and 15 min")).toEqual(point(135));
        expect(parseAnswer("45 min")).toEqual(point(45));
        expect(parseAnswer("an hour and a half")).toEqual(point(90));
        expect(parseAnswer("9h")).toEqual(point(540));
        expect(parseAnswer("12 hours")).toEqual(point(720));
        expect(parseAnswer("24h")).toEqual(point(1440));
    });

    it("reads finite ranges, the unit at the end going to a bare first number", () => {
        const range = (lowMinutes: number, highMinutes: number) => ({ kind: "range", lowMinutes, highMinutes });
        expect(parseAnswer("30-60")).toEqual(range(30, 60));
        expect(parseAnswer("30–60 min")).toEqual(range(30, 60));
        expect(parseAnswer("1-2h")).toEqual(range(60, 120));
        expect(parseAnswer("30 to 60")).toEqual(range(30, 60));
    });

    it("rejects what is not a length", () => {
        for (const text of ["soon", "0", "99999", "1441", "25h", "60-30", "30-30", "at least an hour", ""]) expect(parseAnswer(text), text).toBeNull();
    });

    it("writes a value", () => {
        expect(formatValue({ kind: "point", minutes: 45 })).toBe("45 min");
        expect(formatValue({ lowMinutes: 30, highMinutes: 60 })).toBe("30–60 min");
        expect(formatValue({ lowMinutes: 45, highMinutes: 45 })).toBe("45 min");
    });
});
