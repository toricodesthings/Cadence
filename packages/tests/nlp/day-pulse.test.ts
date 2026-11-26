import { describe, expect, it } from "vitest";
import { analyzeDayPulse, analyzeTaskCues, cueEffortOf, type DayPulseItem } from "@cadence/nlp/day-pulse";

const at = (h: number, m = 0) => h * 60 + m;
const base = { eventCount: 0, dayStartMin: 420, dayEndMin: 1320, nowMin: null as number | null };
const item = (over: Partial<DayPulseItem>): DayPulseItem => ({
    kind: "task",
    title: "Something",
    startMin: null,
    endMin: null,
    knownMinutes: null,
    effort: null,
    effortGuess: null,
    ...over,
});
const fixed = (title: string, start: number, end: number) =>
    item({ kind: "fixed", title, startMin: start, endMin: end });
const routines = Array.from({ length: 6 }, (_, i) =>
    item({ title: `Routine ${i}`, isHabit: true, startMin: at(8 + i), endMin: at(8 + i, 15) }),
);
const classes = [fixed("COMP3000", at(8, 35), at(9, 55)), fixed("COMP3804", at(14, 35), at(15, 55))];
const pulse = (items: DayPulseItem[], over: Partial<typeof base> & { nlpCuesEnabled?: boolean } = {}) =>
    analyzeDayPulse({ ...base, ...over, items });

describe("analyzeTaskCues", () => {
    it("reads heavy, light and silent titles", () => {
        expect(analyzeTaskCues("Deep work on thesis")).toEqual({ heavy: true, light: false, effort: 3 });
        expect(cueEffortOf("quick call with Sam")).toBe(1);
        expect(cueEffortOf("Pick up groceries")).toBe(1);
        expect(cueEffortOf("Groceries")).toBeNull();
        expect(cueEffortOf("Quick check of the tax report")).toBe(3);
    });
});

describe("analyzeDayPulse", () => {
    it("names an empty day and an events-only day", () => {
        expect(pulse([]).kind).toBe("wide_open");
        expect(pulse([], { eventCount: 2 })).toMatchObject({ kind: "event_only", tone: "open", eventCount: 2 });
    });

    it("ignores routines entirely", () => {
        expect(pulse(routines).kind).toBe("wide_open");
        const day = pulse([...routines, ...classes]);
        expect(day).toMatchObject({ kind: "free_after", anchorMinutes: at(16), fixedCount: 2, taskCount: 0 });
        expect(day.bookedMinutes).toBe(160);
    });

    it("tells an open morning from an open afternoon", () => {
        expect(pulse([fixed("Shift", at(17), at(19, 30))]).kind).toBe("open_morning");
        expect(pulse([fixed("Lab", at(8), at(9, 30))]).kind).toBe("open_afternoon");
    });

    it("marks a focus day by title cue or explicit effort", () => {
        const midterm = item({ title: "COMP3000 midterm", knownMinutes: 60 });
        expect(pulse([midterm, item({ title: "Groceries", knownMinutes: 30 })]).kind).toBe("focused");
        expect(pulse([item({ title: "Deep work on thesis" }), item({ title: "Laundry" })]).kind).toBe("focused");
        expect(pulse([item({ title: "Laundry", effort: 3 }), item({ title: "Dishes" })]).kind).toBe("focused");
    });

    it("steps from light to balanced to packed", () => {
        expect(pulse([item({ title: "Laundry", knownMinutes: 60 })])).toMatchObject({
            kind: "light",
            bookedMinutes: 60,
        });
        const three = [1, 2, 3].map((i) => item({ title: `Chore ${i}`, knownMinutes: 60 }));
        expect(pulse(three).kind).toBe("balanced");
        const five = [1, 2, 3, 4, 5].map((i) => item({ title: `Chore ${i}` }));
        expect(pulse(five)).toMatchObject({ kind: "packed", tone: "full", unsizedCount: 5 });
        expect(pulse([fixed("Shift", at(9), at(15))]).kind).toBe("packed");
    });

    it("counts overlapping blocks once", () => {
        const day = pulse([fixed("A", at(9), at(11)), fixed("B", at(10), at(12))]);
        expect(day.bookedMinutes).toBe(180);
    });

    it("drops time already past on today", () => {
        expect(pulse([fixed("Shift", at(17), at(19, 30))]).kind).toBe("open_morning");
        expect(pulse([fixed("Shift", at(17), at(19, 30))], { nowMin: at(10) }).kind).not.toBe("open_morning");
        expect(pulse([fixed("Early", at(7), at(9))], { nowMin: at(10) }).bookedMinutes).toBe(0);
    });

    it("skips title cues and guesses when smart features are off", () => {
        const items = [item({ title: "Deep work on thesis", effortGuess: 3 }), item({ title: "Laundry" })];
        expect(pulse(items).kind).toBe("focused");
        expect(pulse(items, { nlpCuesEnabled: false }).kind).not.toBe("focused");
    });
});
