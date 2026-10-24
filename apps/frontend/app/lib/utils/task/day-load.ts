import type { Task } from "@cadence/contracts/task";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { taskMinutes } from "@cadence/domain/task-length";
import { dayOfInstant } from "../date-format";

/** What a task with no effort set weighs: unknown is not light, so it counts as a middling one. */
const UNKNOWN_EFFORT = 2;

type Level = 1 | 2 | 3;
type Weighed = Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "effort" | "isHabit">;

/**
 * A routine day weighs 1 (known and light, but it takes part of the day). A timed block weighs at least its hours
 * (capped at the heaviest effort), so a 3-hour class is not "light".
 */
function weight(task: Weighed, guess: Level | null) {
    if (task.isHabit) return 1;
    const hours = task.scheduledStart && task.scheduledEnd ? Math.ceil((Date.parse(task.scheduledEnd) - Date.parse(task.scheduledStart)) / 3_600_000) : 0;
    return Math.max(task.effort ?? guess ?? UNKNOWN_EFFORT, Math.min(3, hours));
}

/** Effort-weighted load per day; unset effort counts as its guess, else middling; a timed block by its length, a routine day as 1. */
export function dayLoads<T extends Weighed>(tasks: T[], start: LocalDate, days = 7, guessOf?: (task: T) => Level | null | undefined) {
    const loads = new Map<LocalDate, number>();
    for (let i = 0; i < days; i++) loads.set(addDays(start, i), 0);
    for (const task of tasks) {
        const iso = task.scheduledStart ? dayOfInstant(task.scheduledStart) : task.dueDate;
        if (iso && loads.has(iso)) loads.set(iso, loads.get(iso)! + weight(task, guessOf?.(task) ?? null));
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

type Sized = Pick<Task, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "isHabit">;

/**
 * The known minutes of one day's listed tasks: a block, an estimate, or a supported guess. Tasks with none of those are
 * counted as not sized (never as 60: that would be Cadence inventing a verdict). A routine counts by its typical length when its own answers support one, else not at all; all-day multi-day
 * tasks aren't counted. This is a note on the day, not a capacity: nothing here says a day is too full.
 */
export function dayMinutes<T extends Sized>(tasks: readonly T[], guessOf: (task: T) => { state: "tentative" | "supported"; minutes: number } | null) {
    let minutes = 0;
    let unsized = 0;
    for (const task of tasks) {
        if (!task.isHabit && !task.scheduledStart && task.endDate && task.endDate !== task.dueDate) continue;
        const guess = guessOf(task);
        if (task.isHabit) {
            // A routine counts only when its own answers say how long it takes; without that it is left out, never "not sized".
            if (guess?.state === "supported") minutes += guess.minutes;
            continue;
        }
        const known = (task.scheduledStart && task.scheduledEnd) || task.durationEstimate || guess?.state === "supported";
        if (known) minutes += taskMinutes(task, guess);
        else unsized++;
    }
    return { minutes, unsized };
}

/** "45 min", "4 h", "1 h 30 min": a day's minutes, to the nearest quarter hour once past an hour. */
export function formatDayMinutes(minutes: number) {
    const m = minutes < 60 ? minutes : Math.round(minutes / 15) * 15;
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
