import type { Task } from "@cadence/contracts/task";
import { atLocal, wallTimeOf, type LocalDate, type Instant } from "@cadence/domain/time";
import { rescheduleToDay, type TaskTemporal } from "@cadence/domain/task-temporal";
import { isRecurringTask, isRecurringTaskInstance } from "../task/task-scheduling";
import { getUserZone } from "../user-zone";
import { formatTime } from "../date-format";
import { minutesFromMidnight } from "./calendar-utils";
import { getTaskDurationMs } from "./calendar-math";
import { temporalOf } from "./schedule-model";
import { getDateFromTimedDropId, parseCalendarTimedDropId, type CalendarDropPreview } from "./calendar-dnd";

export const canDragScheduleTask = (task: Task) =>
    !task.isHabit && !isRecurringTask(task) && !isRecurringTaskInstance(task);

interface ScheduleDrop {
    outcome: "timed" | "allday" | "day";
    patch: Partial<TaskTemporal>;
    preview: CalendarDropPreview;
}

/** One interpretation of the target for both the drag preview and the eventual write. */
export function resolveScheduleDrop(task: Task, dropId: string): ScheduleDrop | null {
    if (!canDragScheduleTask(task)) return null;
    const previous = temporalOf(task);
    const zone = getUserZone();
    const durationMs = getTaskDurationMs(task);
    const timedPreview = (dateStr: LocalDate, startMinutes: number, start: Instant): CalendarDropPreview => ({
        kind: "timed", dateStr, startMinutes,
        endMinutes: Math.min(24 * 60, startMinutes + Math.round(durationMs / 60_000)),
        label: `${formatTime(start)} - ${formatTime(new Date(new Date(start).getTime() + durationMs).toISOString())}`,
    });

    if (dropId.startsWith("allday-")) {
        const dateStr = dropId.slice("allday-".length);
        return {
            outcome: "allday",
            patch: task.scheduledStart
                ? { dueDate: dateStr, endDate: null, scheduledStart: null, scheduledEnd: null, zone: null }
                : rescheduleToDay(previous, dateStr, zone),
            preview: { kind: "allday", dateStr },
        };
    }
    if (dropId.startsWith("day-")) {
        const dateStr = dropId.slice("day-".length);
        return {
            outcome: "day",
            patch: rescheduleToDay(previous, dateStr, zone),
            preview: task.scheduledStart
                ? timedPreview(dateStr, minutesFromMidnight(task.scheduledStart), atLocal(dateStr, wallTimeOf(task.scheduledStart, zone), zone))
                : { kind: "allday", dateStr },
        };
    }
    const timed = parseCalendarTimedDropId(dropId);
    if (!timed) return null;
    const { iso } = getDateFromTimedDropId(dropId);
    return {
        outcome: "timed",
        patch: {
            ...(task.scheduledStart ? {} : { dueDate: null, endDate: null }),
            scheduledStart: iso,
            scheduledEnd: new Date(new Date(iso).getTime() + durationMs).toISOString(),
        },
        preview: timedPreview(timed.dateStr, timed.minutes, iso),
    };
}
