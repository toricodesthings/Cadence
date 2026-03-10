import type { Task } from "../../types/task";

/** Height in px for each 1-hour block in the time grid */
export const HOUR_HEIGHT = 72;

/** Number of vertical hour blocks in a full day */
export const HOURS_IN_DAY = 24;

/** Total height of the full-day time grid */
export const DAY_GRID_HEIGHT = HOUR_HEIGHT * HOURS_IN_DAY;

/** Convert an ISO datetime string to minutes elapsed since midnight (local time) */
export function minutesFromMidnight(isoDateTime: string): number {
    const d = new Date(isoDateTime);
    return d.getHours() * 60 + d.getMinutes();
}

/** Calculate the top offset (px) for a task chip based on its scheduledStart */
export function taskTop(task: Task): number {
    if (!task.scheduledStart) return 0;
    return (minutesFromMidnight(task.scheduledStart) / 60) * HOUR_HEIGHT;
}

/** Calculate the height (px) for a task chip based on its duration or estimate */
export function taskHeight(task: Task): number {
    if (task.scheduledStart && task.scheduledEnd) {
        const start = new Date(task.scheduledStart).getTime();
        const end = new Date(task.scheduledEnd).getTime();
        const mins = Math.max(30, (end - start) / 60_000);
        return (mins / 60) * HOUR_HEIGHT;
    }
    const mins = task.durationEstimate ?? 60;
    return (Math.max(30, mins) / 60) * HOUR_HEIGHT;
}
