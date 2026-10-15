import { describe, expect, it } from "vitest";
import { completionBucket, deriveDurations, derivePatterns, durationGroup, groupOfTask, slotBucket, timeOfDay, type SignalRow } from "../../src/domains/ai/memory/signals";

const row = (kind: SignalRow["kind"], on: string, bucket: string, subject: string | null = null, minutes: number | null = null): SignalRow => ({ kind, on, bucket, subject, minutes });
const TODAY = "2026-10-12";

describe("slots and times of day", () => {
    it("names a start by weekday and time of day in the person's zone", () => {
        // 2026-10-13 12:30Z = 08:30 Tuesday in Toronto (EDT).
        expect(slotBucket({ scheduledStart: "2026-10-13T12:30:00Z", dueDate: null }, "America/Toronto")).toBe("tuesday|early");
        // 01:30Z is still Monday night in Toronto (21:30), not Tuesday.
        expect(slotBucket({ scheduledStart: "2026-10-13T01:30:00Z", dueDate: null }, "America/Toronto")).toBe("monday|late");
        expect(slotBucket({ scheduledStart: null, dueDate: "2026-10-16" }, "UTC")).toBe("friday|day");
        expect(slotBucket({ scheduledStart: null, dueDate: null }, "UTC")).toBeNull();
    });

    it("buckets the hour", () => {
        expect([8, 9, 11, 12, 16, 17, 20, 21, 23].map(timeOfDay)).toEqual(["early", "morning", "morning", "afternoon", "afternoon", "evening", "evening", "late", "late"]);
        expect(completionBucket("2026-10-13T00:30:00Z", "America/Toronto")).toBe("evening"); // 20:30
        expect(completionBucket("2026-10-13T01:30:00Z", "America/Toronto")).toBe("late");
    });
});

describe("derivePatterns", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09"];

    it("claims a pattern only with 5+ events, on 3+ days, with 70%+ in one bucket", () => {
        const six = days.map((d) => row("reschedule", d, "tuesday|early"));
        expect(derivePatterns(six, TODAY)).toEqual([
            expect.objectContaining({
                kind: "pattern",
                content: "Plans set for Tuesday early in the morning often get moved (6 of 6 recent changes)",
                value: expect.objectContaining({ signal: "reschedule", bucket: "tuesday|early", numerator: 6, denominator: 6 }),
            }),
        ]);
        expect(derivePatterns(six.slice(0, 4), TODAY)).toEqual([]); // too few events
        expect(derivePatterns(Array.from({ length: 6 }, () => row("reschedule", "2026-10-01", "tuesday|early")), TODAY)).toEqual([]); // one day
        const mixed = [...six.slice(0, 4), row("reschedule", "2026-10-09", "friday|late"), row("reschedule", "2026-10-09", "monday|day")];
        expect(derivePatterns(mixed, TODAY)).toEqual([]); // 4 of 6 is 67%
    });

    it("ignores events outside the 28 days", () => {
        const old = days.map((d) => row("complete", d.replace("2026-10", "2026-08"), "evening"));
        expect(derivePatterns(old, TODAY)).toEqual([]);
    });

    it("words completions and routines plainly, one routine at a time", () => {
        const done = days.map((d) => row("complete", d, "evening"));
        const gym = days.map((d) => row("routine", d, "monday|day", "Gym"));
        const read = days.slice(0, 2).map((d) => row("routine", d, "monday|day", "Reading"));
        const texts = derivePatterns([...done, ...gym, ...read], TODAY).map((f) => f.content).sort();
        expect(texts).toEqual([
            "Tends to finish things in the evening (6 of 6 in the last 4 weeks)",
            "Usually does Gym on Mondays (6 of 6 times in the last 4 weeks)",
        ]);
    });
});

describe("deriveDurations", () => {
    it("takes the median of 3+ reports per group and says how many", () => {
        const rows = [
            ...[40, 50, 90, 50, 45, 60].map((m) => row("duration", TODAY, "report", "lab report", m)),
            ...[20, 30].map((m) => row("duration", TODAY, "report", "email", m)),
        ];
        expect(deriveDurations(rows)).toEqual([
            { kind: "duration", key: "duration|lab report", content: "Lab report usually takes about 50 minutes (6 times)", value: { group: "lab report", medianMinutes: 50, n: 6 } },
        ]);
    });

    it.each([
        ["Lab Report: Titration, week 3!", "lab report"], // cut at ":"
        ["Email Sam re: invoice", "email sam"],
        ["Email Sam re: trip", "email sam"],
        ["Read - chapter 4", "read"],
        ["Gym (legs)", "gym"],
        ["Write the essay for my class", "write essay class"], // filler dropped, first 3 words
        ["Lab 3", "lab"],
        ["Lab 4", "lab"], // 1-2 digit numbers merge
        ["STAT 3503 Practice Exam", "stat 3503 practice"],
        ["STAT 2509 Practice Exam", "stat 2509 practice"], // course codes don't
        ["(draft) report", "draft report"], // nothing before the cut: its plain words
    ])("groups %j as %j", (title, group) => {
        expect(durationGroup(title)).toBe(group);
    });

    it("groups a repeating task by its row", () => {
        expect(groupOfTask({ id: "abc", title: "Pay rent", recurrenceRule: "FREQ=MONTHLY" })).toBe("series:abc");
        expect(groupOfTask({ id: "abc", title: "Pay rent", recurrenceRule: null })).toBe("pay rent");
    });

    it("names a series' duration fact by its title", () => {
        const rows = [10, 12, 14].map((m) => ({ ...row("duration", "2026-10-01", "report", "series:abc", m), title: "Pay rent" }));
        expect(deriveDurations(rows)[0]).toEqual(expect.objectContaining({ key: "duration|series:abc", content: "Pay rent usually takes about 12 minutes (3 times)" }));
    });
});
