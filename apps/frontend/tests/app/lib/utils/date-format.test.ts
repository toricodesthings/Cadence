import { describe, expect, it, vi } from "vitest";
import {
    fromTimeValue,
    getEffectiveTaskDate,
    getDaysInMonth,
    getFirstDayOfWeek,
    preserveLocalTime,
    relativeTime,
    toISODate,
    toTimeValue,
    weekdayLabels,
} from "../../../../app/lib/utils/date-format";

describe("date-format shared helpers", () => {
    it("toISODate uses the local date, not UTC", () => {
        expect(toISODate(new Date(2026, 8, 21, 23, 59))).toBe("2026-09-21");
    });

    it("builds month grids for Monday- and Sunday-first weeks", () => {
        // 1 Sep 2026 is a Tuesday.
        expect(getDaysInMonth(2026, 1)).toBe(28);
        expect(getFirstDayOfWeek(2026, 8)).toBe(1);
        expect(getFirstDayOfWeek(2026, 8, 0)).toBe(2);
        expect(weekdayLabels(2)).toEqual(["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]);
        expect(weekdayLabels(2, 0)).toEqual(["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]);
    });

    it("relativeTime keeps each caller's suffix", () => {
        vi.useFakeTimers().setSystemTime(new Date("2026-09-21T12:00:00Z"));
        expect(relativeTime("2026-09-21T11:59:30Z")).toBe("just now");
        expect(relativeTime("2026-09-21T11:55:00Z")).toBe("5 m");
        expect(relativeTime("2026-09-21T09:00:00Z", { suffix: " ago" })).toBe("3 h ago");
        vi.useRealTimers();
    });

    it("round-trips TimePicker values on a date-only or full ISO base", () => {
        const onDate = fromTimeValue("2026-09-21", "07:30");
        expect(toTimeValue(onDate)).toBe("07:30");
        expect(toISODate(new Date(onDate))).toBe("2026-09-21");
        expect(toTimeValue(fromTimeValue(onDate, "22:05"))).toBe("22:05");
    });

    it("preserveLocalTime moves a timed block to another day at the same local clock time", () => {
        // 21:30 local is a different UTC day in many zones; the result must stay 21:30 local on the target day.
        const late = new Date(2026, 2, 10, 21, 30).toISOString();

        const moved = new Date(preserveLocalTime("2026-03-12", late));

        expect([moved.getFullYear(), moved.getMonth(), moved.getDate(), moved.getHours(), moved.getMinutes()]).toEqual([2026, 2, 12, 21, 30]);
    });

    it("getEffectiveTaskDate reads all-day dates as stored and timed ones in the user's zone", () => {
        expect(getEffectiveTaskDate("2026-03-10T12:00:00.000Z", true)).toBe("2026-03-10");
        expect(getEffectiveTaskDate(new Date(2026, 2, 10, 23, 30).toISOString(), false)).toBe("2026-03-10");
        expect(getEffectiveTaskDate(new Date(2026, 2, 11, 0, 30).toISOString(), false)).toBe("2026-03-11");
    });
});
