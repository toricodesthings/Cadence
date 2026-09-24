import { describe, expect, it } from "vitest";
import { addDaysToDateStr, atLocalDate, resolveTimeZone, toLocalDateStr, toZonedIso } from "../../src/platform/date-utils";

describe("toZonedIso", () => {
    it.each([
        ["2026-09-22T02:30:00.000Z", "America/Toronto", "2026-09-21T22:30:00-04:00"], // daylight time
        ["2026-01-22T02:30:00.000Z", "America/Toronto", "2026-01-21T21:30:00-05:00"], // standard time
        ["2026-09-22T02:30:00.000Z", "Asia/Kolkata", "2026-09-22T08:00:00+05:30"], // half-hour zone
        ["2026-09-22T02:30:00.000Z", "Pacific/Auckland", "2026-09-22T14:30:00+12:00"],
        ["2026-09-22T02:30:00.000Z", "UTC", "2026-09-22T02:30:00+00:00"],
    ])("%s in %s → %s, the same instant", (instant, tz, expected) => {
        const zoned = toZonedIso(new Date(instant), tz);

        expect(zoned).toBe(expected);
        expect(new Date(zoned).getTime()).toBe(new Date(instant).getTime());
    });
});

describe("resolveTimeZone", () => {
    it("keeps a real IANA zone and falls back to UTC for anything else", () => {
        expect(resolveTimeZone("America/Toronto")).toBe("America/Toronto");
        expect(resolveTimeZone("Mars/Olympus")).toBe("UTC");
        expect(resolveTimeZone(undefined)).toBe("UTC");
    });
});

describe("date strings", () => {
    it("toLocalDateStr gives the user's calendar date", () => {
        expect(toLocalDateStr(new Date("2026-09-22T02:30:00.000Z"), "America/Toronto")).toBe("2026-09-21");
    });

    it("addDaysToDateStr crosses month and year ends", () => {
        expect(addDaysToDateStr("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysToDateStr("2026-03-01", -1)).toBe("2026-02-28");
    });
});

describe("atLocalDate", () => {
    it("keeps the local wall-clock time on the new day, across a DST change", () => {
        // 2:00 PM Friday Oct 30 EDT (-04:00) → 2:00 PM Monday Nov 2 EST (-05:00).
        const moved = atLocalDate(new Date("2026-10-30T18:00:00.000Z"), "2026-11-02", "America/Toronto");
        expect(moved.toISOString()).toBe("2026-11-02T19:00:00.000Z");
    });

    it("keeps a late-evening time whose UTC day is the next day", () => {
        const moved = atLocalDate(new Date("2026-09-22T01:00:00.000Z"), "2026-09-28", "America/Toronto");
        expect(moved.toISOString()).toBe("2026-09-29T01:00:00.000Z");
    });
});
