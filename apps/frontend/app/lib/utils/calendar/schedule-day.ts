import type { Task } from "@cadence/contracts/task";
import { type LocalDate } from "@cadence/domain/time";
import { dayOfInstant } from "../date-format";
import { isPassiveTimetableTask } from "../task/task-scheduling";
import { loadWord } from "../task/day-load";
import { daysIn } from "./calendar-math";

/** How a scheduled thing feels: it passes (fixed), it lets go (routine), or it's owed (task). */
export type ScheduleKind = "fixed" | "routine" | "task";

export function scheduleKind(task: Pick<Task, "isHabit" | "interactionMode">): ScheduleKind {
    if (task.isHabit) return "routine";
    return isPassiveTimetableTask(task) ? "fixed" : "task";
}

/**
 * The days a task shows on: a timed block on the user's day of its start (a series instance carries its own
 * occurrence start / due day); an all-day task on `dueDate`, through `endDate` when it spans days.
 */
export function taskDays(task: Pick<Task, "dueDate" | "endDate" | "scheduledStart">): LocalDate[] {
    if (task.scheduledStart) return [dayOfInstant(task.scheduledStart)];
    if (!task.dueDate) return [];
    return task.endDate && task.endDate > task.dueDate ? daysIn(task.dueDate, task.endDate) : [task.dueDate];
}

/** One grouping for every phone surface, routines included, so marks and lists never disagree. */
export function groupByDate(tasks: Task[]) {
    const map = new Map<LocalDate, Task[]>();
    for (const task of tasks) {
        for (const day of taskDays(task)) {
            const list = map.get(day);
            if (list) list.push(task);
            else map.set(day, [task]);
        }
    }
    return map;
}

/** A timed block: it has a start (all-day tasks have none). */
export function isTimed(task: Pick<Task, "scheduledStart">) {
    return Boolean(task.scheduledStart);
}

export function itemStart(task: Task) {
    return new Date(task.scheduledStart!);
}

/** Routines are moments; everything else runs to its end, or its estimate. */
export function itemEnd(task: Task) {
    if (task.scheduledEnd) return new Date(task.scheduledEnd);
    const minutes = task.isHabit ? 0 : task.durationEstimate ?? 30;
    return new Date(itemStart(task).getTime() + minutes * 60_000);
}

export function splitDay(tasks: Task[]) {
    const timed = tasks.filter(isTimed).sort((a, b) => itemStart(a).getTime() - itemStart(b).getTime());
    const allDay = tasks.filter((task) => !isTimed(task));
    return { allDay, timed };
}

export interface FreeGap {
    /** Id of the item the gap follows, or "now" for the stretch starting now. */
    afterId: string;
    start: Date;
    end: Date;
    minutes: number;
}

/** Stretches of at least `minMinutes` between timed items; given `now`, only what's still ahead of it. */
export function freeGaps(timed: Task[], now: Date | null, minMinutes = 30): FreeGap[] {
    const gaps: FreeGap[] = [];
    let cursor: Date | null = now;
    let afterId = "now";
    for (const task of timed) {
        const start = itemStart(task);
        if (cursor) {
            const minutes = Math.floor((start.getTime() - cursor.getTime()) / 60_000);
            if (minutes >= minMinutes) gaps.push({ afterId, start: cursor, end: start, minutes });
        }
        const end = itemEnd(task);
        if (!cursor || end > cursor) {
            cursor = end;
            afterId = task.id;
        }
    }
    return gaps;
}

export function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Effort-weighted load of a day's owed tasks: routines and fixed blocks don't weigh on it. */
export function dayLoad(tasks: Task[]) {
    return tasks.reduce((sum, task) => (scheduleKind(task) === "task" && task.state !== "COMPLETE" ? sum + (task.effort ?? 1) : sum), 0);
}

/** 0–3 dots for a load, matching `loadWord`. */
export function loadDots(load: number) {
    return ({ free: 0, light: 1, steady: 2, busy: 3 } as const)[loadWord(load) as "free" | "light" | "steady" | "busy"];
}
