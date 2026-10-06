import { beforeAll, describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { rescheduleToDay } from "@cadence/domain/task-temporal";
import { addMonthsToDay, addYearsToDay, daysIn } from "../../../../app/lib/utils/calendar/calendar-math";
import { getDateFromTimedDropId, buildCalendarTimedDropId } from "../../../../app/lib/utils/calendar/calendar-dnd";
import { buildTimedTaskLayouts } from "../../../../app/lib/utils/calendar/calendar-utils";
import { getUserZone, setUserZone } from "../../../../app/lib/utils/user-zone";

beforeAll(() => setUserZone("America/Toronto"));

const timed = (id: string, scheduledStart: string, scheduledEnd: string) => ({ id, scheduledStart, scheduledEnd, dueDate: null, endDate: null, zone: "America/Toronto" }) as unknown as Task;

describe("calendar drops across the 2026-11-01 DST change (America/Toronto)", () => {
    it("an hour-slot drop lands at the slot's wall time on that day", () => {
        // 09:30 on Nov 2 is EST (UTC-5); on Oct 30 it is EDT (UTC-4).
        expect(getDateFromTimedDropId(buildCalendarTimedDropId("2026-11-02", 9 * 60 + 30)).iso).toBe("2026-11-02T14:30:00.000Z");
        expect(getDateFromTimedDropId(buildCalendarTimedDropId("2026-10-30", 9 * 60 + 30)).iso).toBe("2026-10-30T13:30:00.000Z");
    });

    it("a timed block dropped on another day keeps its local time and length", () => {
        const start = "2026-10-30T18:35:00.000Z"; // 14:35 EDT
        const end = "2026-10-30T19:35:00.000Z";
        const moved = rescheduleToDay({ dueDate: null, endDate: null, scheduledStart: start, scheduledEnd: end, zone: getUserZone() }, "2026-11-02", getUserZone());
        expect(moved.scheduledStart).toBe("2026-11-02T19:35:00.000Z"); // still 14:35, now EST
        expect(moved.scheduledEnd).toBe("2026-11-02T20:35:00.000Z");
    });

    it("an all-day task dropped on a day sets its day and keeps its span", () => {
        const moved = rescheduleToDay({ dueDate: "2026-10-30", endDate: "2026-11-01", scheduledStart: null, scheduledEnd: null, zone: null }, "2026-11-03", getUserZone());
        expect(moved).toMatchObject({ dueDate: "2026-11-03", endDate: "2026-11-05", scheduledStart: null });
    });

    it("a weekly 14:35 series instance sits in the 14:35 slot before and after the change", () => {
        const before = timed("a::2026-10-27", "2026-10-27T18:35:00.000Z", "2026-10-27T19:35:00.000Z"); // EDT
        const after = timed("a::2026-11-03", "2026-11-03T19:35:00.000Z", "2026-11-03T20:35:00.000Z"); // EST
        const [layoutBefore] = buildTimedTaskLayouts([before]);
        const [layoutAfter] = buildTimedTaskLayouts([after]);
        expect(layoutBefore.top).toBe(layoutAfter.top);
        expect(layoutAfter.top).toBe(((14 * 60 + 35) / 60) * 72);
    });
});

describe("calendar day math", () => {
    it("moves months and years on LocalDates, clamping the day", () => {
        expect(addMonthsToDay("2026-01-31", 1)).toBe("2026-02-28");
        expect(addMonthsToDay("2026-01-15", -1)).toBe("2025-12-15");
        expect(addYearsToDay("2024-02-29", 1)).toBe("2025-02-28");
    });

    it("lists the days of a span across the DST change without skipping or repeating", () => {
        expect(daysIn("2026-10-31", "2026-11-02")).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    });
});
