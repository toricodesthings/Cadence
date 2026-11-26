import type { Instant } from "./time";
import type { DurationGuess } from "@cadence/nlp/duration";

export const DEFAULT_TASK_MINUTES = 60;

export function taskMinutes(
    task: { scheduledStart: Instant | null; scheduledEnd: Instant | null; durationEstimate: number | null },
    guess?: Pick<DurationGuess, "state" | "minutes"> | null,
): number {
    if (task.scheduledStart && task.scheduledEnd) {
        const block = Math.round(
            (new Date(task.scheduledEnd).getTime() - new Date(task.scheduledStart).getTime()) / 60_000,
        );
        if (block > 0) return block;
    }
    if (task.durationEstimate) return task.durationEstimate;
    return guess?.state === "supported" ? guess.minutes : DEFAULT_TASK_MINUTES;
}
