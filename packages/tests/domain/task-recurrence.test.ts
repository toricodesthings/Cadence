import { describe, expect, it } from "vitest";
import { expandScheduleScopedTasks, resolveOccurrenceAnchor, validateTaskRecurrenceRule } from "@cadence/domain/task-recurrence";
import { dayOf, wallTimeOf } from "@cadence/domain/time";

const TORONTO = "America/Toronto";

const BASE_TASK = {
    id: "series-1",
    title: "Calculus II lecture",
    dueDate: null,
    endDate: null,
    zone: TORONTO,
    scheduledStart: "2026-03-10T13:30:00.000Z", // Tue 09:30 EDT
    scheduledEnd: "2026-03-10T14:45:00.000Z",
    durationEstimate: 75,
    recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502",
    orderIndex: 10,
    isPinned: false,
    tagIds: ["tag-1"],
    state: "ACTIVE",
    interactionMode: "task" as const,
};

type Occ = { id: string; occurrenceDay?: string; occurrenceStart?: string; occurrenceEnd?: string | null; scheduledStart: string | null };
const expand = (...args: Parameters<typeof expandScheduleScopedTasks>) => expandScheduleScopedTasks(...args) as unknown as Occ[];

const WEEK = { from: "2026-03-09", to: "2026-03-15" };

describe("task recurrence expansion", () => {
    it("expands weekly recurring time blocks into virtual schedule instances", () => {
        const items = expand([BASE_TASK], WEEK, TORONTO);
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            id: "series-1::2026-03-10",
            seriesId: "series-1",
            isRecurringInstance: true,
            occurrenceDay: "2026-03-10",
            occurrenceStart: "2026-03-10T13:30:00.000Z",
            occurrenceEnd: "2026-03-10T14:45:00.000Z",
            tagIds: ["tag-1"],
        });
        expect(items[1]).toMatchObject({ id: "series-1::2026-03-12", occurrenceStart: "2026-03-12T13:30:00.000Z" });
    });

    it("does not emit expired recurring series", () => {
        const items = expand([{ ...BASE_TASK, recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260308" }], WEEK, TORONTO);
        expect(items).toHaveLength(0);
    });

    it("includes the UNTIL day itself", () => {
        const items = expand([{ ...BASE_TASK, recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260312" }], WEEK, TORONTO);
        expect(items.map((i) => i.occurrenceDay)).toEqual(["2026-03-10", "2026-03-12"]);
    });

    it("preserves passive timetable interaction mode on recurring instances", () => {
        const items = expand([{ ...BASE_TASK, interactionMode: "timetable" as const }], WEEK, TORONTO);
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ interactionMode: "timetable", isRecurringInstance: true });
    });

    it("keeps a weekly 14:35 Toronto series at 14:35 across both DST changes", () => {
        const series = {
            ...BASE_TASK,
            scheduledStart: "2026-10-27T18:35:00.000Z", // Tue 14:35 EDT
            scheduledEnd: "2026-10-27T19:50:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
        };
        const fall = expand([series], { from: "2026-10-27", to: "2026-11-10" }, TORONTO);
        expect(fall.map((i) => i.occurrenceStart)).toEqual(["2026-10-27T18:35:00.000Z", "2026-11-03T19:35:00.000Z", "2026-11-10T19:35:00.000Z"]);

        const spring = expand(
            [{ ...series, scheduledStart: "2026-03-03T19:35:00.000Z", scheduledEnd: "2026-03-03T20:50:00.000Z" }],
            { from: "2026-03-03", to: "2026-03-17" },
            TORONTO,
        );
        expect(spring.map((i) => i.occurrenceStart)).toEqual(["2026-03-03T19:35:00.000Z", "2026-03-10T18:35:00.000Z", "2026-03-17T18:35:00.000Z"]);
        for (const i of [...fall, ...spring]) {
            expect(wallTimeOf(i.occurrenceStart!, TORONTO)).toBe("14:35");
            expect(wallTimeOf(i.occurrenceEnd!, TORONTO)).toBe("15:50");
        }
    });

    it("expands all-day series on LocalDates, never an instant", () => {
        const series = { ...BASE_TASK, id: "rent", scheduledStart: null, scheduledEnd: null, zone: null, dueDate: "2026-03-01", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260316" };
        const items = expand([series], { from: "2026-03-01", to: "2026-03-31" }, TORONTO);
        expect(items.map((i) => i.id)).toEqual(["rent::2026-03-02", "rent::2026-03-09", "rent::2026-03-16"]);
        expect(items.every((i) => i.scheduledStart === null && !("occurrenceStart" in i))).toBe(true);
        expect(items[1]).toMatchObject({ dueDate: "2026-03-09" });
    });

    it("keeps one-offs whose day is inside the window and drops the rest", () => {
        const once = (id: string, extra: object) => ({ ...BASE_TASK, id, recurrenceRule: null, ...extra });
        const items = expand(
            [
                once("a", { scheduledStart: "2026-03-10T13:30:00.000Z" }),
                once("b", { scheduledStart: null, scheduledEnd: null, dueDate: "2026-03-09" }),
                once("c", { scheduledStart: null, scheduledEnd: null, dueDate: "2026-03-20" }),
                // 03:00Z on the 16th is 23:00 on the 15th in Toronto: the user's day wins.
                once("d", { scheduledStart: "2026-03-16T03:00:00.000Z", scheduledEnd: null }),
            ],
            WEEK,
            TORONTO,
        );
        expect(items.map((i) => i.id).sort()).toEqual(["a", "b", "d"]);
        expect(dayOf("2026-03-16T03:00:00.000Z", TORONTO)).toBe("2026-03-15");
    });

    it("resolves the occurrence anchor on or after a reference day", () => {
        expect(resolveOccurrenceAnchor(BASE_TASK as never, "2026-03-11", TORONTO)).toBe("2026-03-12");
        expect(resolveOccurrenceAnchor(BASE_TASK as never, "2026-06-01", TORONTO)).toBe("2026-04-30");
    });

    it("validates rules, including a LocalDate UNTIL", () => {
        expect(() => validateTaskRecurrenceRule("FREQ=WEEKLY;UNTIL=20260502", TORONTO)).not.toThrow();
        expect(() => validateTaskRecurrenceRule("NOT A RULE", TORONTO)).toThrow();
        expect(() => validateTaskRecurrenceRule(null)).not.toThrow();
    });
});
