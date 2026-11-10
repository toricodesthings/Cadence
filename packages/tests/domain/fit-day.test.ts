import { describe, expect, it } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { dispositionDay, fitDay, fitMinutes, isFitCandidate, roomiestDay, weekRoom, type FitDayInput, type FitTask, type RoomTask } from "@cadence/domain/fit-day";

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

describe("weekRoom / roomiestDay", () => {
    const t = (id: string, over: Partial<RoomTask> = {}): RoomTask => ({ id, title: id, state: "ACTIVE", dueDate: null, scheduledStart: null, scheduledEnd: null, durationEstimate: null, ...over });
    const opts = { from: day, days: 7, zone, timelineStartHour: 7 };

    it("an empty week is all open (07:00–22:00 = 900 minutes a day) and the first later day has room", () => {
        const room = weekRoom([], opts);
        expect(room).toHaveLength(7);
        expect(room.every((r) => r.bookedMinutes === 0 && r.openMinutes === 900)).toBe(true);
        expect(roomiestDay(room, 60, { after: day })).toBe("2026-10-21");
    });

    it("counts overlapping blocks once, adds estimates of untimed tasks due that day, and lists deadlines", () => {
        const room = weekRoom([
            t("a", { scheduledStart: at("09:00"), scheduledEnd: at("11:00") }),
            t("b", { scheduledStart: at("10:00"), scheduledEnd: at("12:00") }),
            t("c", { dueDate: day, durationEstimate: 30 }),
            t("d", { dueDate: day, state: "COMPLETE", durationEstimate: 600 }),
        ], opts);
        expect(room[0]).toMatchObject({ bookedMinutes: 210, openMinutes: 690, deadlines: [{ id: "c", title: "c" }] });
    });

    it("a full week falls back to the day with the most room", () => {
        const busy = Array.from({ length: 7 }, (_, i) => {
            const d = `2026-10-2${i}`;
            return t(`x${i}`, { scheduledStart: at("07:00", d), scheduledEnd: at(i === 4 ? "21:00" : "22:00", d) });
        });
        const room = weekRoom(busy, opts);
        expect(roomiestDay(room, 120, { after: day })).toBe("2026-10-24");
    });

    it("keeps the same local window across a DST change (the 23- and 25-hour days still read 900 minutes)", () => {
        const room = weekRoom([], { ...opts, from: "2026-10-30" });
        expect(room.map((r) => r.openMinutes)).toEqual(Array(7).fill(900));
    });
});

describe("dispositionDay", () => {
    const room = weekRoom([], { from: day, days: 7, zone, timelineStartHour: 7 }); // Tue 2026-10-20 …
    it("maps this_week through roomiestDay, inside this week only, and next_week to the week's first day", () => {
        expect(dispositionDay("today", { today: day, room, minutes: 30, weekStart: "Monday" })).toBe(day);
        expect(dispositionDay("this_week", { today: day, room, minutes: 30, weekStart: "Monday" })).toBe("2026-10-21");
        expect(dispositionDay("next_week", { today: day, room, minutes: 30, weekStart: "Monday" })).toBe("2026-10-26");
        expect(dispositionDay("next_week", { today: day, room, minutes: 30, weekStart: "Sunday" })).toBe("2026-10-25");
    });
});
