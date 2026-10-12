import type { Task } from "@cadence/contracts/task";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { dayOfInstant } from "../date-format";

/** What a task with no effort set weighs: unknown is not light, so it counts as a middling one. */
const UNKNOWN_EFFORT = 2;

type Weighed = Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "effort" | "isHabit">;

/**
 * A routine day weighs 1 (known and light, but it takes part of the day). A timed block weighs at least its hours
 * (capped at the heaviest effort), so a 3-hour class is not "light".
 */
function weight(task: Weighed) {
    if (task.isHabit) return 1;
    const hours = task.scheduledStart && task.scheduledEnd ? Math.ceil((Date.parse(task.scheduledEnd) - Date.parse(task.scheduledStart)) / 3_600_000) : 0;
    return Math.max(task.effort ?? UNKNOWN_EFFORT, Math.min(3, hours));
}

/** Effort-weighted load per day; unset effort counts as middling, a timed block by its length, a routine day as 1. */
export function dayLoads(tasks: Weighed[], start: LocalDate, days = 7) {
    const loads = new Map<LocalDate, number>();
    for (let i = 0; i < days; i++) loads.set(addDays(start, i), 0);
    for (const task of tasks) {
        const iso = task.scheduledStart ? dayOfInstant(task.scheduledStart) : task.dueDate;
        if (iso && loads.has(iso)) loads.set(iso, loads.get(iso)! + weight(task));
    }
    return loads;
}

/** Earliest day with the smallest load. */
export function lightestDay(loads: Map<string, number>) {
    let best: string | null = null;
    for (const [iso, load] of loads) if (best === null || load < loads.get(best)!) best = iso;
    return best;
}

export function loadWord(load: number) {
    return load === 0 ? "free" : load <= 2 ? "light" : load <= 5 ? "steady" : "busy";
}
