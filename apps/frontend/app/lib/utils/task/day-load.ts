import type { Task } from "@cadence/contracts/task";
import { addDays, type LocalDate } from "@cadence/domain/time";
import { taskMinutes } from "@cadence/domain/task-length";
import { dayOfInstant } from "../date-format";

const UNKNOWN_EFFORT = 2;

type Level = 1 | 2 | 3;
type Weighed = Pick<Task, "dueDate" | "scheduledStart" | "scheduledEnd" | "effort" | "isHabit">;

function weight(task: Weighed, guess: Level | null) {
    if (task.isHabit) return 1;
    const hours =
        task.scheduledStart && task.scheduledEnd
            ? Math.ceil((Date.parse(task.scheduledEnd) - Date.parse(task.scheduledStart)) / 3_600_000)
            : 0;
    return Math.max(task.effort ?? guess ?? UNKNOWN_EFFORT, Math.min(3, hours));
}

export function dayLoads<T extends Weighed>(
    tasks: T[],
    start: LocalDate,
    days = 7,
    guessOf?: (task: T) => Level | null | undefined,
    shareOf: (task: T) => number = () => 1,
) {
    const loads = new Map<LocalDate, number>();
    for (let i = 0; i < days; i++) loads.set(addDays(start, i), 0);
    for (const task of tasks) {
        const iso = task.scheduledStart ? dayOfInstant(task.scheduledStart) : task.dueDate;
        if (iso && loads.has(iso))
            loads.set(
                iso,
                loads.get(iso)! + weight(task, guessOf?.(task) ?? null) * (task.isHabit ? 1 : shareOf(task)),
            );
    }
    return loads;
}

export function lightestDay(loads: Map<string, number>) {
    let best: string | null = null;
    for (const [iso, load] of loads) if (best === null || load < loads.get(best)!) best = iso;
    return best;
}

export function loadWord(load: number) {
    return load === 0 ? "free" : load <= 2 ? "light" : load <= 5 ? "steady" : "busy";
}

type Sized = Pick<Task, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "isHabit">;

export function dayMinutes<T extends Sized>(
    tasks: readonly T[],
    guessOf: (task: T) => { state: "tentative" | "supported"; minutes: number } | null,
) {
    let minutes = 0;
    let unsized = 0;
    for (const task of tasks) {
        if (!task.isHabit && !task.scheduledStart && task.endDate && task.endDate !== task.dueDate) continue;
        const guess = guessOf(task);
        if (task.isHabit) {
            if (guess?.state === "supported") minutes += guess.minutes;
            continue;
        }
        const known =
            (task.scheduledStart && task.scheduledEnd) || task.durationEstimate || guess?.state === "supported";
        if (known) minutes += taskMinutes(task, guess);
        else unsized++;
    }
    return { minutes, unsized };
}

export function formatDayMinutes(minutes: number) {
    const m = minutes < 60 ? minutes : Math.round(minutes / 15) * 15;
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
