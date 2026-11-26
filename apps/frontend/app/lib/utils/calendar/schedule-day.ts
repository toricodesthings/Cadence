import type { Task } from "@cadence/contracts/task";
import { type LocalDate } from "@cadence/domain/time";
import { taskMinutes } from "@cadence/domain/task-length";
import { dayOfInstant } from "../date-format";
import { isPassiveTimetableTask, isRecurringTask, isRecurringTaskInstance } from "../task/task-scheduling";
import { loadWord } from "../task/day-load";
import { daysIn } from "./calendar-math";

export type ScheduleKind = "fixed" | "routine" | "task";

export function scheduleKind(task: Pick<Task, "isHabit" | "interactionMode">): ScheduleKind {
    if (task.isHabit) return "routine";
    return isPassiveTimetableTask(task) ? "fixed" : "task";
}

export function taskDays(task: Pick<Task, "dueDate" | "endDate" | "scheduledStart">): LocalDate[] {
    if (task.scheduledStart) return [dayOfInstant(task.scheduledStart)];
    if (!task.dueDate) return [];
    return task.endDate && task.endDate > task.dueDate ? daysIn(task.dueDate, task.endDate) : [task.dueDate];
}

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

export function isTimed(task: Pick<Task, "scheduledStart">) {
    return Boolean(task.scheduledStart);
}

export function itemStart(task: Task) {
    return new Date(task.scheduledStart!);
}

export function itemEnd(task: Task) {
    if (task.scheduledEnd) return new Date(task.scheduledEnd);
    return new Date(itemStart(task).getTime() + (task.isHabit ? 0 : taskMinutes(task)) * 60_000);
}

export function splitDay(tasks: Task[]) {
    const timed = tasks.filter(isTimed).sort((a, b) => itemStart(a).getTime() - itemStart(b).getTime());
    const allDay = tasks.filter((task) => !isTimed(task));
    return { allDay, timed };
}

export interface FreeGap {
    afterId: string;
    start: Date;
    end: Date;
    minutes: number;
}

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

export function dayLoad(tasks: Task[], shareOf: (task: Task) => number = () => 1) {
    return tasks.reduce(
        (sum, task) =>
            scheduleKind(task) === "task" && task.state !== "COMPLETE" ? sum + (task.effort ?? 1) * shareOf(task) : sum,
        0,
    );
}

export function loadDots(load: number) {
    return ({ free: 0, light: 1, steady: 2, busy: 3 } as const)[loadWord(load) as "free" | "light" | "steady" | "busy"];
}

export function splitMonthDay(tasks: Task[]) {
    const baseline: Task[] = [];
    const items: Task[] = [];
    for (const task of tasks) {
        const repeatingFixed =
            scheduleKind(task) === "fixed" && (isRecurringTask(task) || isRecurringTaskInstance(task));
        (repeatingFixed ? baseline : items).push(task);
    }
    const timed = baseline.filter(isTimed).sort((a, b) => itemStart(a).getTime() - itemStart(b).getTime());
    const first = timed[0];
    const end = timed.length ? new Date(Math.max(...timed.map((task) => itemEnd(task).getTime()))) : null;
    return {
        items,
        fixed: baseline.length
            ? { count: baseline.length, start: first ? itemStart(first) : null, end, tasks: baseline }
            : null,
    };
}
