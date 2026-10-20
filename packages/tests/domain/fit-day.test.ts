import { describe, expect, it } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { fitDay, fitMinutes, isFitCandidate, type FitDayInput, type FitTask } from "@cadence/domain/fit-day";

const zone = "America/Toronto";
const day = "2026-10-20";
const at = (time: string, d = day, z = zone) => atLocal(d, time, z);
const block = (a: string, b: string, d = day, z = zone) => ({ start: at(a, d, z), end: at(b, d, z) });
const task = (id: string, minutes: number | null): FitTask => ({ id, minutes, notBefore: null });

const base = (over: Partial<FitDayInput> = {}): FitDayInput => ({
    day,
    zone,
    now: at("08:00", "2026-10-19"),
    timelineStartHour: 7,
    busy: [],
    ...over,
});
const none = () => [];

describe("fitDay", () => {
    it("keeps the input order and never overlaps placed blocks, with the buffer between them", () => {
        const result = fitDay([task("b", 30), task("a", 60)], base(), none);
        expect(result.placed.map((p) => p.taskId)).toEqual(["b", "a"]);
        expect(result.placed[0]).toMatchObject({ start: at("07:00"), end: at("07:30") });
        expect(result.placed[1].start).toBe(at("07:45"));
    });

    it("keeps the buffer around Fixed blocks", () => {
        const result = fitDay([task("a", 60)], base({ busy: [block("07:00", "09:00")] }), none);
        expect(result.placed[0].start).toBe(at("09:15"));
    });

    it("lists sized tasks with no gap left as didn't fit, and unsized ones as not sized", () => {
        const busy = [block("07:00", "20:00")];
        const result = fitDay([task("a", 60), task("b", 120), task("c", null)], base({ busy }), none);
        expect(result.placed.map((p) => p.taskId)).toEqual(["a"]);
        expect(result.didntFit).toEqual(["b"]);
        expect(result.notSized).toEqual(["c"]);
    });

    it("asks for each task's own preference, from the parts of the day with room", () => {
        const seen: string[][] = [];
        const result = fitDay([task("a", 30)], base(), (_, feasible) => {
            seen.push(feasible);
            return ["evening"];
        });
        expect(seen[0]).toContain("evening");
        expect(result.placed[0].start).toBe(at("17:00"));
    });

    it("lays out a DST day in two zones on local time", () => {
        expect(fitDay([task("a", 60)], base({ day: "2026-11-01", now: at("08:00", "2026-10-30") }), none).placed[0].start).toBe(at("07:00", "2026-11-01"));
        const london = "Europe/London";
        const input = base({ day: "2026-10-25", zone: london, now: atLocal("2026-10-24", "08:00", london) });
        expect(fitDay([task("a", 60)], input, none).placed[0].start).toBe(atLocal("2026-10-25", "07:00", london));
    });
});

describe("what sizes and what takes part", () => {
    it("the estimate, else a supported guess; never the 60 fallback or a tentative guess", () => {
        expect(fitMinutes({ durationEstimate: 25 }, { state: "supported", minutes: 50 })).toBe(25);
        expect(fitMinutes({ durationEstimate: null }, { state: "supported", minutes: 50 })).toBe(50);
        expect(fitMinutes({ durationEstimate: null }, { state: "tentative", minutes: 50 })).toBeNull();
        expect(fitMinutes({ durationEstimate: null }, null)).toBeNull();
    });

    it("only open, untimed, one-off, one-day tasks that aren't Fixed", () => {
        const t = { state: "ACTIVE", scheduledStart: null, interactionMode: "normal", recurrenceRule: null, dueDate: day, endDate: null };
        expect(isFitCandidate(t)).toBe(true);
        expect(isFitCandidate({ ...t, scheduledStart: at("09:00") })).toBe(false);
        expect(isFitCandidate({ ...t, state: "WAITING" })).toBe(false);
        expect(isFitCandidate({ ...t, interactionMode: "timetable" })).toBe(false);
        expect(isFitCandidate({ ...t, recurrenceRule: "FREQ=DAILY" })).toBe(false);
        expect(isFitCandidate({ ...t, endDate: "2026-10-22" })).toBe(false);
    });
});
