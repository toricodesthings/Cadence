import type { UserSettings } from "../../../types/settings";
import type { Task } from "@cadence/contracts/task";
import type { CalendarViewMode } from "../../../components/calendar/ScheduleHeader";
import type { LocalDate } from "@cadence/domain/time";
import { getMonthDateRange, getWeekDateRange, getYearDateRange } from "../date-format";
import { parseYMD } from "./calendar-math";
import { groupByDate } from "./schedule-day";
import { isPassiveTimetableTask } from "../task/task-scheduling";

export function applyCalendarClutterFilters(tasks: Task[], clutter: UserSettings["calendar"]["clutter"]) {
    return tasks.filter((task) => {
        if (task.isHabit && clutter.showHabitAnchors === false) return false;
        if (!task.isHabit && isPassiveTimetableTask(task) && clutter.showFixed === false) return false;
        if (!task.isHabit && !task.scheduledStart && clutter.showAllDay === false) return false;
        if (!task.isHabit && task.scheduledStart && clutter.showTimedTasks === false) return false;
        return true;
    });
}

/** What a task write carries to put the task back as it was. */
export const temporalOf = (task: Task) => ({
    dueDate: task.dueDate,
    endDate: task.endDate,
    scheduledStart: task.scheduledStart,
    scheduledEnd: task.scheduledEnd,
    zone: task.zone,
});

/** A day-keyed record of tasks, one entry per day each task shows on. */
export const recordByDay = (tasks: Task[]): Record<LocalDate, Task[]> => Object.fromEntries(groupByDate(tasks));

export function isCalendarViewModeValue(value: string | null): value is CalendarViewMode {
    return value === "day" || value === "week" || value === "month" || value === "year";
}

export function scheduleRanges(currentDate: LocalDate, weekStartsOn?: 0 | 1 | 6) {
    const { y, m } = parseYMD(currentDate);
    return {
        day: { start: currentDate, end: currentDate },
        week: getWeekDateRange(currentDate, weekStartsOn),
        month: getMonthDateRange(y, m),
        year: getYearDateRange(y),
    };
}
