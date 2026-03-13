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

export interface TimedTaskLayout {
    task: Task;
    top: number;
    height: number;
    column: number;
    columns: number;
}

type TimedTaskWithRange = {
    task: Task;
    start: number;
    end: number;
};

function getTaskRange(task: Task): TimedTaskWithRange {
    const start = task.scheduledStart ? minutesFromMidnight(task.scheduledStart) : 0;
    const rawEnd = task.scheduledEnd ? minutesFromMidnight(task.scheduledEnd) : start + (task.durationEstimate ?? 60);
    return {
        task,
        start,
        end: Math.max(start + 15, rawEnd),
    };
}

function buildClusterLayouts(cluster: TimedTaskWithRange[]): TimedTaskLayout[] {
    const columns: number[] = [];
    const columnAssignments = new Map<string, number>();

    for (const item of cluster) {
        let columnIndex = columns.findIndex((columnEnd) => item.start >= columnEnd);
        if (columnIndex === -1) {
            columnIndex = columns.length;
            columns.push(item.end);
        } else {
            columns[columnIndex] = item.end;
        }
        columnAssignments.set(item.task.id, columnIndex);
    }

    return cluster.map((item) => ({
        task: item.task,
        top: taskTop(item.task),
        height: taskHeight(item.task),
        column: columnAssignments.get(item.task.id) ?? 0,
        columns: Math.max(1, columns.length),
    }));
}

export function buildTimedTaskLayouts(tasks: Task[]): TimedTaskLayout[] {
    const timed = tasks
        .filter((task) => !task.isAllDay && task.scheduledStart)
        .map(getTaskRange)
        .sort((a, b) => (a.start - b.start) || (a.end - b.end));

    const layouts: TimedTaskLayout[] = [];
    let cluster: TimedTaskWithRange[] = [];
    let clusterMaxEnd = -1;

    for (const item of timed) {
        if (cluster.length === 0 || item.start < clusterMaxEnd) {
            cluster.push(item);
            clusterMaxEnd = Math.max(clusterMaxEnd, item.end);
            continue;
        }

        layouts.push(...buildClusterLayouts(cluster));
        cluster = [item];
        clusterMaxEnd = item.end;
    }

    if (cluster.length > 0) {
        layouts.push(...buildClusterLayouts(cluster));
    }

    return layouts;
}
