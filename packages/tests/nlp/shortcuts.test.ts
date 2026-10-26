import { describe, expect, it } from "vitest";
import { parse } from "@cadence/nlp";

const CLOCK = { today: "2026-10-06", now: "10:00", weekStart: "Sunday" as const };
const dates = (input: string) =>
    parse({ input, sourceSurface: "inline_add", clock: CLOCK, context: { projects: [], tags: [] } }).entities
        .filter((e) => e.type === "scheduled_start" || e.type === "due_date")
        .map((e) => ({ text: e.sourceText, confidence: e.confidence, date: (e.normalizedValue as { date: string }).date, time: (e.normalizedValue as { time: string | null }).time }));

describe("date shortcuts", () => {
    it("reads a shortcut as the same day, one step below the full word, on the person's own characters", () => {
        expect(dates("standup tomorrow at 9am")).toEqual([{ text: "tomorrow at 9am", confidence: "high", date: "2026-10-07", time: "09:00" }]);
        expect(dates("standup tmrw at 9am")).toEqual([{ text: "tmrw at 9am", confidence: "medium", date: "2026-10-07", time: "09:00" }]);
        expect(dates("gym this wknd")).toEqual([{ text: "this wknd", confidence: "medium", date: "2026-10-10", time: null }]);
        expect(dates("pay rent 2moro")).toMatchObject([{ text: "2moro", confidence: "medium" }]);
    });

    it("reads dictated times as words, keeping a bare hour ambiguous", () => {
        expect(dates("dentist tomorrow at five pm")).toMatchObject([{ text: "tomorrow at five pm", confidence: "high", time: "17:00" }]);
        expect(dates("dentist tomorrow at quarter to four pm")).toMatchObject([{ time: "15:45" }]);
        expect(dates("lunch tomorrow at half past three").map((d) => d.confidence)).toEqual(["low", "low"]);
    });

    it("leaves names and look-alikes alone", () => {
        expect(dates("Email Tom the notes")).toEqual([]);
        expect(dates("call mum tom")).toEqual([]);
        expect(dates("Buy tomatoes")).toEqual([]);
    });
});

describe("a bare weekday", () => {
    it("is its nearest day, today included, whatever the machine zone; a passed time today is next week's", () => {
        expect(dates("call sam tues")).toMatchObject([{ date: "2026-10-06" }]);
        expect(dates("call sam tuesday at 3pm")).toMatchObject([{ date: "2026-10-06" }]);
        expect(dates("call sam tuesday at 9am")).toMatchObject([{ date: "2026-10-13" }]);
        expect(dates("call sam next tuesday")).toMatchObject([{ date: "2026-10-13" }]);
        expect(dates("call sam mon")).toMatchObject([{ date: "2026-10-12" }]);
    });
});
