import { useCallback, useMemo } from "react";
import type { Task } from "@cadence/contracts/task";
import type { LocalDate } from "@cadence/domain/time";
import { isLocalDate } from "@cadence/domain/time";
import { useTasks } from "../tasks/use-tasks";
import { useSettings } from "../core/use-settings";
import { useHolidayOverlay } from "../environment/use-holiday-overlay";
import { useVirtualHabitTasks } from "../habits/use-virtual-habit-tasks";
import { useHabitsRange } from "../habits/use-habits";
import { usePersonalEvents } from "./use-personal-events";
import type { CalendarViewMode } from "../../components/calendar/ScheduleHeader";
import { SETTINGS_DEFAULTS } from "../../types/settings";
import { applyCalendarClutterFilters, recordByDay, scheduleRanges } from "../../lib/utils/calendar/schedule-model";
import { dayLoad, groupByDate, scheduleKind, taskDays } from "../../lib/utils/calendar/schedule-day";
import { getDaysInMonth, getWeekDays, isoDay } from "../../lib/utils/date-format";
import { parseYMD } from "../../lib/utils/calendar/calendar-math";
import { isPassiveTimetableTask, isRecurringTask, isRecurringTaskInstance } from "../../lib/utils/task/task-scheduling";

const EMPTY_TASKS: Task[] = [];

export function useScheduleData({ currentDate, viewMode, todayIso, isPhone }: {
    currentDate: LocalDate;
    viewMode: CalendarViewMode;
    todayIso: LocalDate;
    isPhone: boolean;
}) {
    const { y: year, m: month } = parseYMD(currentDate);
    const isPhoneDay = isPhone && viewMode === "day";
    const ranges = useMemo(() => scheduleRanges(currentDate), [currentDate]);
    const periodRange = ranges[viewMode];
    // Phone Day keeps the week strip populated. The query key stays the same as before.
    const queryRange = isPhoneDay ? ranges.week : periodRange;
    const { data: tasks = EMPTY_TASKS } = useTasks({ state: "ACTIVE", range: { from: queryRange.start, to: queryRange.end } });
    const weekDates = useMemo(() => getWeekDays(currentDate), [currentDate]);
    const holidayOverlay = useHolidayOverlay({ ...queryRange, viewMode });
    const { data: userSettings } = useSettings();
    const calendarClutter = userSettings?.calendar?.clutter ?? SETTINGS_DEFAULTS.calendar.clutter;
    const birthdayDate = useMemo<LocalDate | null>(() => {
        const bd = userSettings?.profile?.birthday;
        if (!bd || !isLocalDate(bd)) return null;
        // bd is a LocalDate: keep its month and day, in the viewed year (Feb 29 falls on Feb 28 in common years)
        const { m, d } = parseYMD(bd);
        return isoDay(year, m, Math.min(d, getDaysInMonth(year, m)));
    }, [userSettings?.profile?.birthday, year]);

    // ── Personal events overlay ────────────────────────────────────────────
    const personalEvents = usePersonalEvents(year, month);

    const personalEventsByDateRecord = useMemo<Record<string, import("../../types/settings").PersonalEvent[]>>(() => {
        return Object.fromEntries(personalEvents.eventsByDate.entries());
    }, [personalEvents.eventsByDate]);

    const personalEventDateCounts = useMemo<Record<string, number>>(() => {
        return Object.fromEntries(
            Array.from(personalEvents.eventsByDate.entries()).map(([dateStr, events]) => [dateStr, events.length]),
        );
    }, [personalEvents.eventsByDate]);

    // Year has no routines; the other views share the active task range.
    const habitRange = viewMode === "year" ? { start: "", end: "", enabled: false } : { ...queryRange, enabled: true };
    const virtualHabitTasks = useVirtualHabitTasks(habitRange);
    const { data: rawHabits = [] } = useHabitsRange(habitRange);
    const habitById = useMemo(() => new Map(rawHabits.map((habit) => [habit.id, habit])), [rawHabits]);
    const visibleTasks = useMemo(() => applyCalendarClutterFilters(tasks, calendarClutter), [tasks, calendarClutter]);
    const visibleHabitTasks = useMemo(() => calendarClutter.showHabitAnchors === false ? EMPTY_TASKS : virtualHabitTasks,
        [calendarClutter.showHabitAnchors, virtualHabitTasks]);
    // ── Group month tasks by LocalDate ──────────────────────────────────────
    // Habits are intentionally NOT injected into tasksByDay for month view (Routines has its own month).
    const { datesWithTasks, tasksByDay } = useMemo(() => {
        const byDay = recordByDay(visibleTasks);
        const withTasks = new Set<LocalDate>(Object.keys(byDay));
        for (const h of visibleHabitTasks) {
            for (const day of taskDays(h)) withTasks.add(day);
        }
        return { datesWithTasks: withTasks, tasksByDay: byDay };
    }, [visibleHabitTasks, visibleTasks]);

    const holidaysByDateRecord = useMemo<Record<string, import("@cadence/contracts/proxy").HolidayRecord[]>>(() => {
        return Object.fromEntries(holidayOverlay.holidaysByDate.entries());
    }, [holidayOverlay.holidaysByDate]);

    // ── Group week tasks by LocalDate ───────────────────────────────────────
    const weekTasksByDate = useMemo(() => recordByDay([...visibleTasks, ...visibleHabitTasks]), [visibleHabitTasks, visibleTasks]);

    const allVisibleTasks = useMemo(() => new Map([...visibleTasks, ...visibleHabitTasks].map((task) => [task.id, task])),
        [visibleTasks, visibleHabitTasks]);
    // ── Phone surface: one grouping (routines included) for marks and lists ─
    const phoneGroups = useMemo(() => {
        if (!isPhone || viewMode === "year") return new Map<LocalDate, Task[]>();
        return groupByDate([...visibleTasks, ...visibleHabitTasks]);
    }, [isPhone, viewMode, visibleHabitTasks, visibleTasks]);

    /** Holiday, birthday and personal-event names by ISO day, for the phone surface. */
    const phoneMarkers = useMemo(() => {
        const map = new Map<LocalDate, string[]>();
        if (!isPhone) return map;
        const add = (iso: LocalDate, name: string) => map.set(iso, [...(map.get(iso) ?? []), name]);
        if (holidayOverlay.enabled) {
            for (const [iso, holidays] of Object.entries(holidaysByDateRecord)) holidays.forEach((holiday) => add(iso, holiday.name));
        }
        if (birthdayDate) add(birthdayDate, "Your birthday");
        if (personalEvents.enabled) {
            for (const [iso, events] of Object.entries(personalEventsByDateRecord)) events.forEach((event) => add(iso, event.label));
        }
        return map;
    }, [birthdayDate, holidayOverlay.enabled, holidaysByDateRecord, personalEvents.enabled, personalEventsByDateRecord, isPhone]);

    const weekLoads = useMemo(
        () => new Map(weekDates.map((day) => [day, dayLoad(phoneGroups.get(day) ?? [])])),
        [phoneGroups, weekDates],
    );

    const routineEmoji = useCallback(
        (task: Task) => (task.isHabit ? habitById.get(task.id.split("--")[0].replace(/^habit-/, ""))?.emoji ?? null : null),
        [habitById],
    );

    const { data: holdingTasks = EMPTY_TASKS } = useTasks({ state: "ACTIVE", hasNoProject: true, hasNoDate: true, enabled: isPhoneDay });
    const readyTasks = useMemo(() => holdingTasks.filter((task) => !isPassiveTimetableTask(task)), [holdingTasks]);

    /** Today's open, movable tasks: what "Lighten today" may offer. Never fixed blocks or routines. */
    const lightenCandidates = useMemo(() => (phoneGroups.get(todayIso) ?? []).filter((task) =>
        scheduleKind(task) === "task" && task.state !== "COMPLETE" && !isRecurringTask(task) && !isRecurringTaskInstance(task),
    ), [phoneGroups, todayIso]);

    return {
        visibleTasks, visibleHabitTasks, allVisibleTasks, tasksByDay, datesWithTasks, weekTasksByDate, weekDates,
        periodRange, holidayOverlay, holidaysByDateRecord, birthdayDate, personalEvents, personalEventsByDateRecord,
        personalEventDateCounts, userSettings, calendarClutter, phoneGroups, phoneMarkers, weekLoads,
        habitById, routineEmoji, readyTasks, lightenCandidates,
    };
}
export type ScheduleData = ReturnType<typeof useScheduleData>;
