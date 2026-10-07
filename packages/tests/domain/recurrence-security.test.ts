import { describe, expect, it } from "vitest";
import { expandSeries, isValidRule, nextOccurrence } from "@cadence/domain/time";
import { habitOccurrences } from "@cadence/domain/repeats";

const range = { from: "2026-10-07", to: "2027-10-06" };
const series = (rule: string) => ({ rule, start: { day: range.from }, zone: "UTC", range });

describe("bounded recurrence", () => {
    it.each([
        "FREQ=SECONDLY", "FREQ=MINUTELY", "FREQ=HOURLY",
        "RRULE:freq=secondly", "FREQ=DAILY;FREQ=SECONDLY",
        "RRULE:FREQ=DAILY\nRRULE:FREQ=SECONDLY", "FREQ=DAILY\nRDATE:20261007T000000Z",
        "DTSTART:19000101T000000Z\nRRULE:FREQ=DAILY", "FREQ=DAILY;DTSTART=19000101T000000Z",
        "FREQ=DAILY;BYHOUR=0,1,2", "FREQ=DAILY;BYMINUTE=0,1", "FREQ=DAILY;BYSECOND=0,1",
        "FREQ=DAILY;INTERVAL=-1", "FREQ=DAILY;INTERVAL=1.5", "FREQ=DAILY;INTERVAL=0",
        "FREQ=DAILY;INTERVAL=999999999999999999999", "FREQ=DAILY;COUNT=-1", "FREQ=DAILY;COUNT=0",
        "FREQ=DAILY;BYMONTH=13", "FREQ=DAILY;BYDAY=0MO", "FREQ=DAILY;BYSETPOS=0",
        "FREQ=DAILY;UNTIL=20260230", "FREQ=DAILY;UNTIL=20261008;UNTIL=20261009",
        "FREQ=WEEKLY;BYDAY=MO;BYWEEKDAY=TU",
        "FREQ=DAILY;BYSETPOS=1,1", "FREQ=DAILY;BYSETPOS=1,+1,01",
        "FREQ=DAILY;BYSETPOS=2", "FREQ=WEEKLY;BYSETPOS=8",
        "FREQ=DAILY;BYSETPOS=" + Array(230).fill("1").join(","),
    ])("rejects %s before both task and routine expansion", (rule) => {
        expect(isValidRule(rule)).toBe(false);
        expect(() => expandSeries(series(rule))).toThrow(expect.objectContaining({ code: "INVALID_RECURRENCE_RULE" }));
        expect(() => habitOccurrences(rule, "2026-10-07T00:00:00Z", range.from, range.to, "UTC")).toThrow();
        expect(() => nextOccurrence({ ...series(rule), from: range.from })).toThrow();
    });

    it("rejects excessive ranges and ancient anchor prefixes without truncating", () => {
        expect(() => expandSeries({ ...series("FREQ=DAILY"), range: { from: range.from, to: "9999-12-31" } })).toThrow();
        expect(() => expandSeries({ ...series("FREQ=DAILY"), start: { day: "1900-01-01" } })).toThrow();
    });

    it("rejects repeated positions before scanning a long prefix", () => {
        const rule = "FREQ=DAILY;BYSETPOS=" + Array(230).fill("1").join(",");
        expect(() => expandSeries({ ...series(rule), start: { day: "1927-10-07" }, range: { from: range.from, to: range.from } }))
            .toThrow(expect.objectContaining({ code: "INVALID_RECURRENCE_RULE" }));
    });

    it("finishes an impossible rule without searching to year 9999", () => {
        // A wall-clock assertion guards the upstream no-candidate loop, which
        // never invokes between's result callback. Leave ample CI headroom.
        const begin = performance.now();
        expect(expandSeries(series("FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30"))).toEqual([]);
        expect(performance.now() - begin).toBeLessThan(1000);
    });

    it.each([
        ["FREQ=DAILY;COUNT=3", ["2026-10-07", "2026-10-08", "2026-10-09"]],
        ["FREQ=DAILY;BYSETPOS=1,-1;COUNT=3", ["2026-10-07", "2026-10-08", "2026-10-09"]],
        ["RRULE:freq=weekly;byweekday=WE;COUNT=2", ["2026-10-07", "2026-10-14"]],
        ["FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=2", ["2026-10-30", "2026-11-30"]],
        ["FREQ=MONTHLY;BYMONTHDAY=1;COUNT=2", ["2026-11-01", "2026-12-01"]],
        ["FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;COUNT=1", ["2027-01-01"]],
    ])("preserves calendar semantics for %s", (rule, days) => {
        expect(expandSeries(series(rule)).map((item) => item.day)).toEqual(days);
        expect(habitOccurrences(rule, "2026-10-07T00:00:00Z", range.from, range.to, "UTC")).toEqual(days);
    });
});
