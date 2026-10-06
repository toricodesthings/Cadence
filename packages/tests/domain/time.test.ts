import { describe, expect, it } from "vitest";
import {
    addDays,
    atLocal,
    dayOf,
    daysBetween,
    endOfDay,
    expandSeries,
    formatInZone,
    isLocalDate,
    isValidRule,
    isZone,
    monthRange,
    startOfDay,
    todayIn,
    toZonedIso,
    untilOf,
    wallTimeOf,
    weekRange,
    weekdayOf,
} from "@cadence/domain/time";

const TORONTO = "America/Toronto";
const LA = "America/Los_Angeles";

describe("zones", () => {
    it("accepts IANA names only", () => {
        expect(isZone("America/Toronto")).toBe(true);
        expect(isZone("UTC")).toBe(true);
        expect(isZone("local")).toBe(false);
        expect(isZone("device")).toBe(false);
        expect(isZone("-04:00")).toBe(false);
        expect(isZone("Mars/Base")).toBe(false);
        expect(isZone(null)).toBe(false);
    });
});

describe("atLocal across DST", () => {
    it("skips the spring gap forward (02:30 → 03:30)", () => {
        expect(atLocal("2026-03-08", "02:30", TORONTO)).toBe("2026-03-08T07:30:00.000Z");
        expect(toZonedIso(atLocal("2026-03-08", "02:30", TORONTO), TORONTO)).toBe("2026-03-08T03:30:00-04:00");
        expect(toZonedIso(atLocal("2026-03-08", "02:30", LA), LA)).toBe("2026-03-08T03:30:00-07:00");
    });

    it("takes the earlier instant in the fall overlap", () => {
        expect(atLocal("2026-11-01", "01:30", TORONTO)).toBe("2026-11-01T05:30:00.000Z"); // EDT, first pass
        expect(atLocal("2026-11-01", "01:30", LA)).toBe("2026-11-01T08:30:00.000Z"); // PDT
    });

    it("keeps the wall time on ordinary days either side of a change", () => {
        expect(atLocal("2026-10-26", "14:35", TORONTO)).toBe("2026-10-26T18:35:00.000Z");
        expect(atLocal("2026-11-02", "14:35", TORONTO)).toBe("2026-11-02T19:35:00.000Z");
    });

    it("bounds a day, including a 23 and a 25 hour day", () => {
        expect(startOfDay("2026-11-01", TORONTO)).toBe("2026-11-01T04:00:00.000Z");
        expect(endOfDay("2026-11-01", TORONTO)).toBe("2026-11-02T04:59:59.999Z"); // 25 hours
        expect(Date.parse(startOfDay("2026-03-09", TORONTO)) - Date.parse(startOfDay("2026-03-08", TORONTO))).toBe(23 * 3_600_000);
    });
});

describe("dayOf", () => {
    it("reads 23:59 and 00:00 on the right day at the zone extremes", () => {
        const kiritimati = "Pacific/Kiritimati"; // UTC+14
        const pago = "Pacific/Pago_Pago"; // UTC-11
        expect(dayOf("2026-10-05T09:59:00Z", kiritimati)).toBe("2026-10-05"); // 23:59
        expect(dayOf("2026-10-05T10:00:00Z", kiritimati)).toBe("2026-10-06"); // 00:00
        expect(dayOf("2026-10-05T10:59:00Z", pago)).toBe("2026-10-04"); // 23:59
        expect(dayOf("2026-10-05T11:00:00Z", pago)).toBe("2026-10-05"); // 00:00
    });

    it("is the day the app shows for a late deadline instant", () => {
        expect(dayOf("2026-10-06T03:59:00.000Z", TORONTO)).toBe("2026-10-05");
        expect(todayIn(TORONTO, new Date("2026-10-06T03:59:00Z"))).toBe("2026-10-05");
        expect(wallTimeOf("2026-10-06T03:59:00Z", TORONTO)).toBe("23:59");
    });

    it("round-trips: dayOf(atLocal(d, 00:00, z), z) === d for random days and zones", () => {
        const zones = ["America/Toronto", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Europe/London", "Australia/Lord_Howe", "Asia/Kolkata", "UTC"];
        let seed = 42;
        const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
        for (let i = 0; i < 1000; i++) {
            const day = addDays("2024-01-01", Math.floor(rand() * 1500));
            const zone = zones[Math.floor(rand() * zones.length)];
            expect(dayOf(atLocal(day, "00:00", zone), zone), `${day} ${zone}`).toBe(day);
            expect(dayOf(atLocal(day, "23:59", zone), zone), `${day} ${zone} late`).toBe(day);
        }
    });
});

describe("LocalDate arithmetic", () => {
    it("is zone-free", () => {
        expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
        expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
        expect(daysBetween("2026-10-05", "2026-11-02")).toBe(28);
        expect(weekdayOf("2026-10-05")).toBe(1); // Monday
        expect(weekRange("2026-10-07", "Monday")).toEqual({ start: "2026-10-05", end: "2026-10-11" });
        expect(weekRange("2026-10-07", "Sunday")).toEqual({ start: "2026-10-04", end: "2026-10-10" });
        expect(monthRange("2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
        expect(isLocalDate("2026-02-30")).toBe(false);
        expect(isLocalDate("2026-10-05T00:00:00Z")).toBe(false);
    });
});

describe("formatInZone", () => {
    it("shows an instant in the zone and a LocalDate as stored", () => {
        expect(formatInZone("2026-10-06T03:59:00Z", TORONTO, { month: "short", day: "numeric" })).toBe("Oct 5");
        expect(formatInZone("2026-10-05", "Pacific/Kiritimati", { month: "short", day: "numeric" })).toBe("Oct 5");
        expect(formatInZone("2026-10-05", "Pacific/Pago_Pago", { month: "short", day: "numeric" })).toBe("Oct 5");
    });
});

describe("expandSeries", () => {
    const classStart = atLocal("2026-10-26", "14:35", TORONTO); // Monday
    const classEnd = atLocal("2026-10-26", "15:55", TORONTO);

    it("keeps a weekly 14:35 class at 14:35 across the November DST change", () => {
        const days = expandSeries({
            rule: "FREQ=WEEKLY;BYDAY=MO",
            start: { instant: classStart, end: classEnd },
            zone: TORONTO,
            range: { from: "2026-10-26", to: "2026-11-09" },
        });
        expect(days.map((d) => d.day)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
        expect(days.map((d) => wallTimeOf(d.start!, TORONTO))).toEqual(["14:35", "14:35", "14:35"]);
        expect(days[1].start).toBe("2026-11-02T19:35:00.000Z"); // not 18:35Z: no drift
        expect(days.map((d) => wallTimeOf(d.end!, TORONTO))).toEqual(["15:55", "15:55", "15:55"]);
    });

    it("keeps 14:35 across the March change too", () => {
        const days = expandSeries({
            rule: "FREQ=WEEKLY;BYDAY=SU",
            start: { instant: atLocal("2026-03-01", "14:35", TORONTO) },
            zone: TORONTO,
            range: { from: "2026-03-01", to: "2026-03-15" },
        });
        expect(days.map((d) => wallTimeOf(d.start!, TORONTO))).toEqual(["14:35", "14:35", "14:35"]);
    });

    it("lands a daily 02:30 series on 03:30 on spring-forward", () => {
        const days = expandSeries({
            rule: "FREQ=DAILY",
            start: { instant: atLocal("2026-03-07", "02:30", TORONTO) },
            zone: TORONTO,
            range: { from: "2026-03-07", to: "2026-03-09" },
        });
        expect(days.map((d) => toZonedIso(d.start!, TORONTO).slice(11, 16))).toEqual(["02:30", "03:30", "02:30"]);
    });

    it("treats UNTIL as inclusive on its local day, for timed and all-day series", () => {
        const timed = expandSeries({
            rule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102",
            start: { instant: classStart },
            zone: TORONTO,
            range: { from: "2026-10-26", to: "2026-12-31" },
        });
        expect(timed.map((d) => d.day)).toEqual(["2026-10-26", "2026-11-02"]);
        const allDay = expandSeries({ rule: "FREQ=DAILY;UNTIL=20261007", start: { day: "2026-10-05" }, zone: TORONTO, range: { from: "2026-10-01", to: "2026-10-31" } });
        expect(allDay).toEqual([
            { day: "2026-10-05", start: null, end: null },
            { day: "2026-10-06", start: null, end: null },
            { day: "2026-10-07", start: null, end: null },
        ]);
    });

    it("reads a legacy UNTIL instant on the series' local day", () => {
        expect(untilOf("FREQ=WEEKLY;UNTIL=20261103T035959Z", TORONTO)).toBe("2026-11-02");
        expect(untilOf("FREQ=WEEKLY;UNTIL=20261103", TORONTO)).toBe("2026-11-03");
        expect(untilOf("FREQ=WEEKLY", TORONTO)).toBeNull();
    });

    it("validates rules", () => {
        expect(isValidRule("FREQ=WEEKLY;BYDAY=MO;UNTIL=20261102")).toBe(true);
        expect(isValidRule("FREQ=NOPE")).toBe(false);
        expect(isValidRule("FREQ=WEEKLY;UNTIL=garbage")).toBe(false);
    });

    it("stays on the same local days wherever the machine is (floating frame)", () => {
        const a = expandSeries({ rule: "FREQ=WEEKLY;BYDAY=TU,TH", start: { instant: atLocal("2026-10-06", "09:00", LA) }, zone: LA, range: { from: "2026-10-06", to: "2026-10-12" } });
        expect(a.map((d) => d.day)).toEqual(["2026-10-06", "2026-10-08"]);
    });
});

describe("toZonedIso", () => {
    it.each([
        ["2026-09-22T02:30:00.000Z", "America/Toronto", "2026-09-21T22:30:00-04:00"], // daylight time
        ["2026-01-22T02:30:00.000Z", "America/Toronto", "2026-01-21T21:30:00-05:00"], // standard time
        ["2026-09-22T02:30:00.000Z", "Asia/Kolkata", "2026-09-22T08:00:00+05:30"], // half-hour zone
        ["2026-09-22T02:30:00.000Z", "Pacific/Auckland", "2026-09-22T14:30:00+12:00"],
        ["2026-09-22T02:30:00.000Z", "UTC", "2026-09-22T02:30:00+00:00"],
    ])("%s in %s -> %s, the same instant", (instant, zone, expected) => {
        const zoned = toZonedIso(instant, zone);
        expect(zoned).toBe(expected);
        expect(Date.parse(zoned)).toBe(Date.parse(instant));
    });
});
