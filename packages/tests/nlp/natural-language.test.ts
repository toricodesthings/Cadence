import { describe, expect, it } from "vitest";
import { parse } from "@cadence/nlp";
import type { NlpClock } from "@cadence/nlp/core";

// 0.29.0 regression corpus: meaning must survive from typed text to parsed fields.
const CLOCK: NlpClock = { today: "2026-10-06", now: "10:00", weekStart: "Sunday" };
const context = {
    projects: [{ id: "p-work", name: "Work" }],
    tags: [
        { id: "t-exp", name: "Expecting" },
        { id: "t-err", name: "errands" },
    ],
};
const run = (input: string, ctx?: typeof context) =>
    parse({ input, sourceSurface: "inline_add", clock: CLOCK, context: ctx });
const of = (r: ReturnType<typeof run>, type: string) => r.entities.filter((e) => e.type === type);

describe("natural language that carries through", () => {
    it("keeps a flexible window literal and adds no unrelated tag", () => {
        const r = run("do this thing in the next 2 days", context);
        expect(of(r, "tag")).toHaveLength(0);
        expect(r.cleanedTitle).toBe("do this thing in the next 2 days");
        for (const e of r.entities) expect(e.confidence).toBe("low");
    });

    it("treats 'in 30 minutes' as a start, not an estimate", () => {
        const r = run("Call Sam in 30 minutes");
        expect(of(r, "duration")).toHaveLength(0);
        const start = of(r, "scheduled_start")[0];
        expect(start.normalizedValue).toMatchObject({ date: "2026-10-06", time: "10:30" });
        expect(r.cleanedTitle).toBe("Call Sam");
    });

    it("still reads 'for 30 minutes' as an estimate", () => {
        expect(of(run("Call Sam for 30 minutes"), "duration")[0].normalizedValue).toMatchObject({ minutes: 30 });
    });

    it("does not make a 'monthly report' repeat", () => {
        const r = run("Send monthly report tomorrow");
        expect(of(r, "recurrence")).toHaveLength(0);
        expect(of(r, "scheduled_start")[0].normalizedValue).toMatchObject({ date: "2026-10-07" });
        expect(r.cleanedTitle).toBe("Send monthly report");
    });

    it("never erases a second date", () => {
        const r = run("Review draft tomorrow and send Friday");
        expect(r.cleanedTitle).toContain("Friday");
    });

    it("keeps quoted words literal", () => {
        const r = run('Read "every Monday" tomorrow');
        expect(of(r, "recurrence")).toHaveLength(0);
        expect(r.cleanedTitle).toBe("Read every Monday");
    });

    it("carries an explicit end time", () => {
        const r = run("Email Alex tomorrow 2pm to 3pm");
        expect(of(r, "scheduled_start")[0].normalizedValue).toMatchObject({ time: "14:00", endTime: "15:00" });
    });

    it("reads every other Tuesday as biweekly", () => {
        const r = run("Water plants every other Tuesday");
        expect(of(r, "recurrence")[0].normalizedValue).toMatchObject({ rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU" });
        expect(r.cleanedTitle).toBe("Water plants");
    });

    it("keeps a timed deadline phrase whole", () => {
        const r = run("Finish report by Friday at 5pm");
        expect(r.cleanedTitle).toBe("Finish report by Friday at 5pm");
    });

    it("matches an exact list only with a cue, and never plain connectives", () => {
        const r = run("Plan budget in Work", context);
        expect(of(r, "project")[0].normalizedValue).toMatchObject({ id: "p-work" });
        expect(of(run("Clean the Expecting corner on Monday", context), "tag")).toHaveLength(0);
        expect(of(run("tag it errands", context), "tag")[0].normalizedValue).toMatchObject({ id: "t-err" });
    });
});

describe("recurrence beside a date", () => {
    it("keeps both", () => {
        const r = run("Stretch every weekday tomorrow");
        expect(of(r, "recurrence")).toHaveLength(1);
        expect(of(r, "scheduled_start")[0]?.normalizedValue).toMatchObject({ date: "2026-10-07" });
    });
});
