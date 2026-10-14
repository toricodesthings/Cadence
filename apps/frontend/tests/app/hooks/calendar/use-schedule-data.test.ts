import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task } from "@cadence/contracts/task";
import { useScheduleData } from "../../../../app/hooks/calendar/use-schedule-data";
import { scheduleRanges } from "../../../../app/lib/utils/calendar/schedule-model";
import { setUserZone } from "../../../../app/lib/utils/user-zone";
import { SETTINGS_DEFAULTS } from "../../../../app/types/settings";
import type { CalendarViewMode } from "../../../../app/components/calendar/ScheduleHeader";

const mocks = vi.hoisted(() => ({
    tasks: [] as Task[], holding: [] as Task[], virtual: [] as Task[], settings: undefined as unknown,
    taskQuery: vi.fn(), habitQuery: vi.fn(), holidays: vi.fn(),
}));
vi.mock("../../../../app/hooks/tasks/use-tasks", () => ({ useTasks: (options: { hasNoDate?: boolean }) => {
    mocks.taskQuery(options); return { data: options.hasNoDate ? mocks.holding : mocks.tasks };
} }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: mocks.settings }) }));
vi.mock("../../../../app/hooks/environment/use-holiday-overlay", () => ({ useHolidayOverlay: (options: unknown) => {
    mocks.holidays(options); return { enabled: true, holidaysByDate: new Map(), holidayDateSet: new Set() };
} }));
vi.mock("../../../../app/hooks/habits/use-virtual-habit-tasks", () => ({ useVirtualHabitTasks: () => mocks.virtual }));
vi.mock("../../../../app/hooks/habits/use-habits", () => ({ useHabitsRange: (options: unknown) => {
    mocks.habitQuery(options); return { data: [] };
} }));
vi.mock("../../../../app/hooks/calendar/use-personal-events", () => ({ usePersonalEvents: () => ({
    enabled: true, eventsByDate: new Map(), eventDateSet: new Set(), getEventsForDate: () => [],
}) }));
const task = (patch: Partial<Task>): Task => ({ id: "t", title: "Task", state: "ACTIVE", dueDate: "2026-11-02",
    scheduledStart: null, scheduledEnd: null, endDate: null, ...patch }) as Task;
const input = (viewMode: CalendarViewMode, isPhone = false) => ({ viewMode, isPhone, currentDate: "2026-11-02", todayIso: "2026-11-02" });
beforeEach(() => {
    vi.clearAllMocks();
    mocks.tasks = []; mocks.holding = []; mocks.virtual = []; mocks.settings = undefined;
    setUserZone("America/Toronto");
});

describe("schedule active-range data", () => {
    it("keeps query, routine, holiday and displayed bounds together when settings load and change", () => {
        const { result, rerender } = renderHook(() => useScheduleData(input("week")));
        const verify = (start: string, end: string) => {
            expect(result.current.weekDates).toEqual(expect.arrayContaining([start, end]));
            expect(result.current.weekDates[0]).toBe(start);
            expect(result.current.periodRange).toEqual({ start, end });
            expect(mocks.taskQuery).toHaveBeenCalledWith({ state: "ACTIVE", range: { from: start, to: end } });
            expect(mocks.habitQuery).toHaveBeenLastCalledWith({ start, end, enabled: true });
            expect(mocks.holidays).toHaveBeenLastCalledWith({ start, end, viewMode: "week" });
        };
        verify("2026-11-01", "2026-11-07");
        mocks.settings = { dateTime: { weekStart: "Monday" } };
        rerender();
        verify("2026-11-02", "2026-11-08");
        mocks.settings = { dateTime: { weekStart: "Saturday" } };
        rerender();
        verify("2026-10-31", "2026-11-06");
    });
    it.each(["day", "week", "month", "year"] as const)("reads one task range for %s", (view) => {
        renderHook(() => useScheduleData(input(view)));
        const range = scheduleRanges("2026-11-02", 0)[view];
        expect(mocks.taskQuery).toHaveBeenCalledWith({ state: "ACTIVE", range: { from: range.start, to: range.end } });
        expect(mocks.taskQuery.mock.calls.filter(([options]) => options.range)).toHaveLength(1);
        expect(mocks.holidays).toHaveBeenCalledWith({ ...range, viewMode: view });
    });
    it("keeps Phone Day's week populated while its visible period remains one day", () => {
        const { result } = renderHook(() => useScheduleData(input("day", true)));
        const range = scheduleRanges("2026-11-02", 0).week;
        expect(mocks.taskQuery).toHaveBeenCalledWith({ state: "ACTIVE", range: { from: range.start, to: range.end } });
        expect(mocks.habitQuery).toHaveBeenCalledWith({ ...range, enabled: true });
        expect(mocks.taskQuery).toHaveBeenCalledWith({ state: "ACTIVE", hasNoProject: true, hasNoDate: true, enabled: true });
        expect(result.current.periodRange).toEqual({ start: "2026-11-02", end: "2026-11-02" });
    });
    it("keeps routine markers out of desktop month task chips but includes them in phone lists", () => {
        mocks.tasks = [task({ id: "task" })];
        mocks.virtual = [task({ id: "habit-r--2026-11-02", isHabit: true })];
        const { result } = renderHook(() => useScheduleData(input("month", true)));
        expect(result.current.tasksByDay["2026-11-02"].map((t) => t.id)).toEqual(["task"]);
        expect(result.current.datesWithTasks.has("2026-11-02")).toBe(true);
        expect(result.current.phoneGroups.get("2026-11-02")?.map((t) => t.id)).toEqual(["task", "habit-r--2026-11-02"]);
    });
    it("disables routine reads for Year and clamps a leap-day birthday to the viewed year", () => {
        mocks.settings = { profile: { birthday: "2000-02-29" } };
        const { result } = renderHook(() => useScheduleData(input("year")));
        expect(mocks.habitQuery).toHaveBeenCalledWith({ start: "", end: "", enabled: false });
        expect(result.current.birthdayDate).toBe("2026-02-28");
    });
    it("filters the active range and keeps fixed, recurring, complete and routine items out of relief actions", () => {
        mocks.tasks = [task({ id: "open" }), task({ id: "done", state: "COMPLETE" }),
            task({ id: "series", recurrenceRule: "FREQ=WEEKLY" }), task({ id: "fixed", interactionMode: "timetable" })];
        mocks.virtual = [task({ id: "routine", isHabit: true })];
        mocks.settings = { calendar: { clutter: { ...SETTINGS_DEFAULTS.calendar.clutter, showFixed: false } } };
        mocks.holding = [task({ id: "ready", dueDate: null }), task({ id: "fixed-ready", interactionMode: "timetable" })];
        const { result } = renderHook(() => useScheduleData(input("day", true)));
        expect(result.current.visibleTasks.map((t) => t.id)).toEqual(["open", "done", "series"]);
        expect(result.current.lightenCandidates.map((t) => t.id)).toEqual(["open"]);
        expect(result.current.readyTasks.map((t) => t.id)).toEqual(["ready"]);
    });
});
