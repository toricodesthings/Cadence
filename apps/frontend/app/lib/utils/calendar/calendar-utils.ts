import type { Task } from "@cadence/contracts/task";
import { wallTimeOf } from "@cadence/domain/time";
import { taskMinutes } from "@cadence/domain/task-length";
import { getUserZone } from "../user-zone";

/** Height in px for each 1-hour block in the time grid */
export const HOUR_HEIGHT = 72;

/** Number of vertical hour blocks in a full day */
const HOURS_IN_DAY = 24;

/** Total height of the full-day time grid */
export const DAY_GRID_HEIGHT = HOUR_HEIGHT * HOURS_IN_DAY;

/** Minutes elapsed since midnight on the user's wall clock at this instant */
export function minutesFromMidnight(instant: string): number {
    const [h, m] = wallTimeOf(instant, getUserZone()).split(":").map(Number);
    return h * 60 + m;
}

/** Calculate the top offset (px) for a task chip based on its scheduledStart */
function taskTop(task: Task): number {
    if (!task.scheduledStart) return 0;
    return (minutesFromMidnight(task.scheduledStart) / 60) * HOUR_HEIGHT;
}

/** Height (px) of a routine marker and of the shortest span, so nothing renders as a blank sliver */
export const MARKER_HEIGHT = 24;

/** The shortest rendered height of a block (15 minutes of grid), so a 5-minute task stays visible and tappable. */
export const MIN_BLOCK_HEIGHT = HOUR_HEIGHT / 4;

/** Height (px) of a task chip: its real length, never below `MIN_BLOCK_HEIGHT`. Collisions use the same rendered length. */
function taskHeight(task: Task): number {
    return Math.max(MIN_BLOCK_HEIGHT, (taskMinutes(task) / 60) * HOUR_HEIGHT);
}

interface TimedLayoutBase {
    task: Task;
    top: number;
    height: number;
    column: number;
    columns: number;
}

export type TimedPointLayout = TimedLayoutBase & { points: [Task, ...Task[]] } & ({ marker: "row" } | { marker: "badge" });
type TimedSpanLayout = TimedLayoutBase & { marker?: never; badge?: boolean };
export type TimedTaskLayout = TimedPointLayout | TimedSpanLayout;

type TimedTaskWithRange = {
    task: Task;
    start: number;
    end: number;
};

function getTaskRange(task: Task): TimedTaskWithRange {
    const start = task.scheduledStart ? minutesFromMidnight(task.scheduledStart) : 0;
    // Collide on the rendered length: two 5-minute blocks at 9:00 and 9:05 sit side by side, never one over the other.
    return { task, start, end: start + Math.max(taskMinutes(task), (MIN_BLOCK_HEIGHT / HOUR_HEIGHT) * 60) };
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

function buildSpanLayouts(spans: Task[]): TimedTaskLayout[] {
    const timed = spans
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

/**
 * One day's timed items. Routines are points that never take column width from a span:
 * points whose bands overlap share one marker, and a marker over a span docks as a badge on it.
 */
export function buildTimedTaskLayouts(tasks: Task[]): TimedTaskLayout[] {
    const timed = tasks.filter((task) => task.scheduledStart);
    const layouts = buildSpanLayouts(timed.filter((task) => !task.isHabit));

    const points = timed
        .filter((task) => task.isHabit)
        .map((task) => ({ task, top: taskTop(task) }))
        .sort((a, b) => a.top - b.top);
    const groups: { top: number; tasks: [Task, ...Task[]] }[] = [];
    for (const point of points) {
        const last = groups[groups.length - 1];
        if (last && point.top - last.top < MARKER_HEIGHT) last.tasks.push(point.task);
        else groups.push({ top: point.top, tasks: [point.task] });
    }

    for (const group of groups) {
        const covered = layouts.filter((span): span is TimedSpanLayout => span.marker === undefined && group.top < span.top + span.height && group.top + MARKER_HEIGHT > span.top);
        covered.forEach((span) => { span.badge = true; });
        layouts.push({
            task: group.tasks[0], top: group.top, height: MARKER_HEIGHT, column: 0, columns: 1,
            marker: covered.length ? "badge" : "row", points: group.tasks,
        });
    }
    return layouts;
}
