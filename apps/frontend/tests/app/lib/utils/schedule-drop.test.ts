import { beforeEach, describe, expect, it } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { canDragScheduleTask, resolveScheduleDrop } from "../../../../app/lib/utils/calendar/schedule-drop";
import { applyCalendarClutterFilters, recordByDay, scheduleRanges } from "../../../../app/lib/utils/calendar/schedule-model";
import { setUserZone } from "../../../../app/lib/utils/user-zone";
import { SETTINGS_DEFAULTS } from "../../../../app/types/settings";

const task = (patch: Partial<Task> = {}): Task => ({
    id: "t1", title: "Task", state: "ACTIVE", dueDate: null, endDate: null,
    scheduledStart: null, scheduledEnd: null, zone: null, durationEstimate: 60, ...patch,
}) as Task;
beforeEach(() => setUserZone("America/Toronto"));

describe("schedule drop rules", () => {
    it("turns an all-day span into a timed block and clears the old day fields", () => {
        const result = resolveScheduleDrop(task({ dueDate: "2026-10-30", endDate: "2026-11-01" }), "slot-2026-11-02__570");
        expect(result).toMatchObject({ outcome: "timed", patch: {
            dueDate: null, endDate: null, scheduledStart: "2026-11-02T14:30:00.000Z", scheduledEnd: "2026-11-02T15:30:00.000Z",
        }, preview: { kind: "timed", dateStr: "2026-11-02", startMinutes: 570, endMinutes: 630 } });
    });
    it("moves a timed block across DST with the same wall time, duration and preview", () => {
        const result = resolveScheduleDrop(task({ scheduledStart: "2026-10-30T18:35:00.000Z", scheduledEnd: "2026-10-30T19:35:00.000Z", zone: "America/Toronto" }), "day-2026-11-02");
        expect(result).toMatchObject({ outcome: "day", patch: {
            scheduledStart: "2026-11-02T19:35:00.000Z", scheduledEnd: "2026-11-02T20:35:00.000Z", zone: "America/Toronto",
        }, preview: { kind: "timed", startMinutes: 875, endMinutes: 935 } });
    });
    it("clears timed fields when moving a block onto an all-day target", () => {
        const result = resolveScheduleDrop(task({ scheduledStart: "2026-10-30T18:35:00.000Z", scheduledEnd: "2026-10-30T19:35:00.000Z", zone: "America/Toronto" }), "allday-2026-11-02");
        expect(result).toMatchObject({ outcome: "allday", patch: {
            dueDate: "2026-11-02", endDate: null, scheduledStart: null, scheduledEnd: null, zone: null,
        }, preview: { kind: "allday", dateStr: "2026-11-02" } });
    });
    it.each(["day-2026-11-03", "allday-2026-11-03"])("keeps an all-day span on %s", (target) => {
        expect(resolveScheduleDrop(task({ dueDate: "2026-10-30", endDate: "2026-11-01" }), target)?.patch).toMatchObject({
            dueDate: "2026-11-03", endDate: "2026-11-05",
        });
    });
    it.each([{ isHabit: true }, { recurrenceRule: "FREQ=WEEKLY" }, { seriesId: "series" }])("rejects routine/series drops %s", (patch) => {
        expect(canDragScheduleTask(task(patch))).toBe(false);
        expect(resolveScheduleDrop(task(patch), "day-2026-11-02")).toBeNull();
    });
    it("ignores unknown targets and clips previews at the end of the day", () => {
        expect(resolveScheduleDrop(task(), "not-a-target")).toBeNull();
        expect(resolveScheduleDrop(task(), "slot-2026-11-02__1440")).toBeNull();
        expect(resolveScheduleDrop(task(), "slot-2026-11-02__1425")?.preview.endMinutes).toBe(1440);
    });
});

describe("schedule range and grouping rules", () => {
    it("uses calendar-day bounds for every period", () => {
        expect(scheduleRanges("2026-11-02")).toMatchObject({
            day: { start: "2026-11-02", end: "2026-11-02" },
            year: { start: "2026-01-01", end: "2026-12-31" },
        });
    });
    it("keeps clutter categories independent and groups every day of an all-day span", () => {
        const tasks = [task({ id: "all", dueDate: "2026-11-01", endDate: "2026-11-03" }),
            task({ id: "timed", scheduledStart: "2026-11-02T15:00:00Z" }),
            task({ id: "fixed", interactionMode: "timetable", scheduledStart: "2026-11-02T15:00:00Z" }),
            task({ id: "routine", isHabit: true, dueDate: "2026-11-02" })];
        const filtered = applyCalendarClutterFilters(tasks, { ...SETTINGS_DEFAULTS.calendar.clutter, showFixed: false });
        expect(filtered.map((t) => t.id)).toEqual(["all", "timed", "routine"]);
        expect(recordByDay(filtered)["2026-11-03"].map((t) => t.id)).toEqual(["all"]);
    });
});
