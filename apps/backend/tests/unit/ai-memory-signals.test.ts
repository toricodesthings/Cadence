import { describe, expect, it } from "vitest";
import { completionBucket, deriveDurations, derivePatterns, durationGroup, groupOfTask, slotBucket, timeOfDay, type ReportRow, type SignalRow } from "../../src/domains/ai/memory/signals";

const row = (kind: SignalRow["kind"], on: string, bucket: string, subject: string | null = null): SignalRow => ({ kind, on, bucket, subject });
let n = 0;
const answer = (group: string, minutes: number, day: string, extra: Partial<ReportRow> = {}): ReportRow => ({
    group, taskId: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`, title: "Lab report", projectId: null, series: false, low: minutes, high: minutes, anchored: false, day, ...extra,
});
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

    it("needs two weeks: six reschedules in one burnout week claim nothing", () => {
        const oneWeek = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-09"].map((d) => row("reschedule", d, "tuesday|early"));
        expect(derivePatterns(oneWeek, TODAY)).toEqual([]);
        expect(derivePatterns([...oneWeek.slice(0, 5), row("reschedule", "2026-09-30", "tuesday|early")], TODAY)).toHaveLength(1);
    });

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
    it("states a group's duration only when the estimator is sure, and says how many answers", () => {
        const rows = [
            ...[[40, "2026-10-01"], [50, "2026-10-03"], [60, "2026-10-05"], [50, "2026-10-07"], [45, "2026-10-09"], [55, "2026-10-10"]].map(([m, d]) => answer("lab report", m as number, d as string)),
            ...[[20, "2026-10-09"], [30, "2026-10-10"]].map(([m, d]) => answer("email", m as number, d as string, { title: "Email" })),
        ];
        expect(deriveDurations(rows, TODAY)).toEqual([
            { kind: "duration", key: "duration|lab report", content: "Lab report usually takes about 50 minutes (based on 6 of your answers)", value: { group: "lab report", medianMinutes: 50, n: 6 } },
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
        const rows = [[10, "2026-09-01"], [12, "2026-10-01"], [14, "2026-10-08"]].map(([m, d]) => answer("series:abc", m as number, d as string, { title: "Pay rent", series: true, taskId: "11111111-1111-4111-8111-111111111111" }));
        expect(deriveDurations(rows, TODAY)[0]).toEqual(expect.objectContaining({ key: "duration|series:abc", content: "Pay rent usually takes about 10 minutes (based on 3 of your answers)" }));
    });
});
