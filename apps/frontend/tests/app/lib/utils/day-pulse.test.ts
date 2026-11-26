import { beforeEach, describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { buildDayPulse, formatDayPulse } from "../../../../app/lib/utils/task/day-pulse";
import { setDateFormatConfig } from "../../../../app/lib/utils/date-format";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const DAY = "2026-10-12";
const at = (hm: string) => `${DAY}T${hm}:00-04:00`;
const t = (patch: Partial<Task>) =>
    ({
        title: "Something",
        isHabit: false,
        interactionMode: null,
        scheduledStart: null,
        scheduledEnd: null,
        durationEstimate: null,
        effort: null,
        priority: 0,
        ...patch,
    }) as Task;
const fixed = (title: string, start: string, end: string) =>
    t({ title, scheduledStart: at(start), scheduledEnd: at(end), interactionMode: "timetable" } as Partial<Task>);
const routine = (title: string) => t({ title, isHabit: true, scheduledStart: at("08:00") });
const opts = {
    eventCount: 0,
    dayHours: { timelineStartHour: 7, dayEndHour: 22 },
    nowMin: null,
    effortGuessOf: () => null,
    durationGuessOf: (): { state: "tentative" | "supported"; minutes: number } | null => null,
    nlpEnabled: true,
};
const view = (tasks: Task[], over: Partial<typeof opts> = {}) =>
    formatDayPulse(buildDayPulse(DAY, tasks, { ...opts, ...over }));
const classes = [fixed("COMP3000", "08:35", "09:55"), fixed("COMP3804", "14:35", "15:55")];

describe("day pulse", () => {
    beforeEach(() => {
        setUserZone("America/Toronto");
        setDateFormatConfig({ timeDisplay: "12h", dateStyle: "mdy", weekStartsOn: 1 });
    });

    it("says when a two-class day frees up, in 12h and 24h, ignoring routines", () => {
        const tasks = [...["Meds", "Water", "Stretch"].map(routine), ...classes];
        expect(view(tasks)).toMatchObject({ label: "Free after 4:00 PM", tone: "light" });
        setDateFormatConfig({ timeDisplay: "24h", dateStyle: "mdy", weekStartsOn: 1 });
        expect(view(tasks).label).toBe("Free after 16:00");
        expect(view(tasks).breakdown).toBe("2 fixed blocks · ~2 h 45 min booked");
    });

    it("names open, light, focus, paced and full days without a verdict", () => {
        expect(view([routine("Meds")])).toMatchObject({ label: "Wide open", breakdown: "Nothing booked" });
        expect(view([], { eventCount: 1 }).label).toBe("Open · 1 event");
        expect(view([t({ title: "Laundry", durationEstimate: 60 })]).label).toBe("Light · ~1 h");
        expect(view([t({ title: "Laundry" })]).label).toBe("Light day");
        expect(view([t({ title: "Deep work on thesis" }), t({ title: "Laundry" })]).label).toBe("Focus day");
        const three = [1, 2, 3].map((i) => t({ title: `Chore ${i}`, durationEstimate: 60 }));
        expect(view(three).label).toBe("Paced · ~3 h");
        const five = [1, 2, 3, 4, 5].map((i) => t({ title: `Chore ${i}` }));
        expect(view(five)).toMatchObject({ label: "Full day", breakdown: "5 tasks · 5 not sized" });
        for (const v of [view(five), view(three)]) expect(v.label).not.toMatch(/busy|steady/i);
    });

    it("counts a supported duration guess as known time", () => {
        const guessed = view([t({ title: "Laundry" })], {
            durationGuessOf: () => ({ state: "supported" as const, minutes: 45 }),
        });
        expect(guessed.label).toBe("Light · ~45 min");
    });
});
