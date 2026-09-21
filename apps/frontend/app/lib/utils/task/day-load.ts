import type { Task } from "@cadence/contracts/task";
import { addDays, toISODate } from "../date-format";
import { toTaskDateOnly } from "./task-scheduling";

/** Effort-weighted load per day: unset effort counts as light (1). */
export function dayLoads(tasks: Pick<Task, "dueDate" | "scheduledStart" | "effort">[], start: Date, days = 7) {
    const loads = new Map<string, number>();
    for (let i = 0; i < days; i++) loads.set(toISODate(addDays(start, i)), 0);
    for (const task of tasks) {
        const iso = toTaskDateOnly(task.dueDate ?? task.scheduledStart);
        if (iso && loads.has(iso)) loads.set(iso, loads.get(iso)! + (task.effort ?? 1));
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
