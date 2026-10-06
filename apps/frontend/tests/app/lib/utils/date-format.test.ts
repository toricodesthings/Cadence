import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    fromPickerDate,
    fromTimeValue,
    getDaysInMonth,
    getFirstDayOfWeek,
    getWeekDays,
    pickerDate,
    relativeTime,
    toTimeValue,
    weekdayLabels,
} from "../../../../app/lib/utils/date-format";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

describe("date-format shared helpers", () => {
    beforeEach(() => setUserZone("America/Toronto"));

    it("pickerDate and fromPickerDate round-trip a LocalDate through a widget Date", () => {
        expect(fromPickerDate(pickerDate("2026-09-21"))).toBe("2026-09-21");
        expect(fromPickerDate(new Date(2026, 8, 21, 23, 59))).toBe("2026-09-21");
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

    it("round-trips TimePicker values on a day or an instant, in the user's zone", () => {
        const onDay = fromTimeValue("2026-09-21", "07:30");
        expect(onDay).toBe("2026-09-21T11:30:00.000Z"); // 07:30 EDT
        expect(toTimeValue(onDay)).toBe("07:30");
        expect(toTimeValue(fromTimeValue(onDay, "22:05"))).toBe("22:05");
        expect(fromTimeValue(fromTimeValue(onDay, "22:05"), "08:00")).toBe(fromTimeValue("2026-09-21", "08:00"));
    });

    it("lists a week's days as LocalDates", () => {
        expect(getWeekDays("2026-09-23", 1)).toEqual([
            "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
        ]);
    });
});
