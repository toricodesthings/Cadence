import { describe, expect, it } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { BUFFER_MINUTES, bucketOf, busyBlocks, findTimes, timeOfDay, type FindTimeInput } from "@cadence/domain/find-time";

const zone = "America/Toronto";
const day = "2026-10-20";
const at = (time: string, d = day, z = zone) => atLocal(d, time, z);
const block = (a: string, b: string, d = day, z = zone) => ({ start: at(a, d, z), end: at(b, d, z) });

const base = (over: Partial<FindTimeInput> = {}): FindTimeInput => ({
    task: { minutes: 45, notBefore: null, currentStart: null },
    day,
    zone,
    now: at("08:00", "2026-10-19"),
    timelineStartHour: 7,
    busy: [],
    preferred: [],
    ...over,
});

describe("findTimes window and grid", () => {
    it("starts at the calendar's first hour (never before 6) on a 15-minute grid, ends by 22:00", () => {
        const all = findTimes(base({ timelineStartHour: 3 }));
        expect(all[0].start).toBe(at("06:00"));
        expect(all.every((p) => Date.parse(p.end) <= Date.parse(at("22:00")))).toBe(true);
        expect(all.every((p) => new Date(p.start).getUTCMinutes() % 15 === 0)).toBe(true);
    });

    it("clamps today to the next 15 minutes from now", () => {
        const now = at("10:07", day);
        expect(findTimes(base({ now }))[0].start).toBe(at("10:15"));
    });

    it("returns nothing for a day before Hide until, or when the task can't fit the window", () => {
        expect(findTimes(base({ task: { minutes: 45, notBefore: "2026-10-21", currentStart: null } }))).toEqual([]);
        expect(findTimes(base({ task: { minutes: 17 * 60, notBefore: null, currentStart: null } }))).toEqual([]);
    });
});

describe("busy and buffer", () => {
    it("keeps a 15-minute buffer on both sides", () => {
        const [first] = findTimes(base({ busy: [block("07:00", "08:00")] }));
        expect(first.start).toBe(at("08:15"));
        expect(BUFFER_MINUTES).toBe(15);
    });

    it("doesn't offer a gap exactly the task's length", () => {
        const input = base({ task: { minutes: 60, notBefore: null, currentStart: null }, busy: [block("06:00", "09:00"), block("10:00", "22:00")] });
        expect(findTimes(input)).toEqual([]);
    });

    it("offers a gap with room for the buffers", () => {
        const input = base({ task: { minutes: 60, notBefore: null, currentStart: null }, busy: [block("06:00", "09:00"), block("10:30", "22:00")] });
        expect(findTimes(input)[0].start).toBe(at("09:15"));
    });

    it("busyBlocks skips done, archived, all-day and the task itself", () => {
        const t = (id: string, state = "ACTIVE", s: string | null = at("09:00"), e: string | null = at("10:00")) => ({ id, state, scheduledStart: s, scheduledEnd: e });
        expect(busyBlocks([t("a"), t("me"), t("done", "COMPLETE"), t("old", "ARCHIVED"), t("allday", "ACTIVE", null, null)], "me")).toHaveLength(1);
    });
});

describe("order and spacing", () => {
    it("puts a preferred time of day first, earlier preferences ahead of later ones", () => {
        const evening = findTimes(base({ preferred: ["evening", "morning"] }));
        expect(evening[0].bucket).toBe("evening");
        expect(findTimes(base({ preferred: ["evening", "morning"] })).map((p) => p.bucket)).toContain("morning");
    });

    it("keeps a task near its current time on this day", () => {
        const [first] = findTimes(base({ task: { minutes: 45, notBefore: null, currentStart: at("15:00") } }));
        expect(first.start).toBe(at("15:00"));
    });

    it("never offers overlapping proposals, and at most 8", () => {
        const all = findTimes(base());
        expect(all.length).toBeLessThanOrEqual(8);
        for (let i = 1; i < all.length; i++) for (let j = 0; j < i; j++) expect(Date.parse(all[i].start) < Date.parse(all[j].end) && Date.parse(all[i].end) > Date.parse(all[j].start)).toBe(false);
    });

    it("is chronological without a preference", () => {
        const starts = findTimes(base()).map((p) => p.start);
        expect(starts).toEqual([...starts].sort());
    });
});

describe("time of day", () => {
    it("buckets local hours", () => {
        expect([8, 9, 11, 12, 16, 17, 20, 21].map(timeOfDay)).toEqual(["early", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "late"]);
        expect(bucketOf(at("19:30"), zone)).toBe("evening");
    });
});

describe("DST days", () => {
    it.each([
        ["America/Toronto", "2026-11-01"],
        ["America/Toronto", "2026-03-08"],
        ["Europe/London", "2026-03-29"],
        ["Pacific/Auckland", "2026-09-27"],
    ])("%s on %s: proposals are real local quarter-hours inside the window", (z, d) => {
        const all = findTimes(base({ day: d, zone: z, now: at("08:00", "2026-01-01", z), busy: [] }));
        expect(all.length).toBeGreaterThan(0);
        for (const p of all) {
            expect(new Date(p.start).getUTCMinutes() % 15).toBe(0);
            expect(Date.parse(p.start)).toBeGreaterThanOrEqual(Date.parse(at("06:00", d, z)));
            expect(Date.parse(p.end)).toBeLessThanOrEqual(Date.parse(at("22:00", d, z)));
        }
    });
});
