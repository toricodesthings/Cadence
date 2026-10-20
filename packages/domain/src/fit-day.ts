// Fit today: a whole day's untimed tasks laid into its gaps, in one preview. Pure: it proposes, in the person's own
// order, and never moves an existing block, touches a task with a time, shortens, splits or moves anything to another day.
import type { TimeOfDay } from "@cadence/contracts/planning";
import { feasibleBuckets, findTimes, type FindTimeInput } from "./find-time";
import type { Instant, LocalDate } from "./time";
import type { DurationGuess } from "@cadence/nlp/duration";

/** A task the run may place. `minutes` null = not sized: no estimate and no supported guess (the 60 fallback never sizes here). */
export interface FitTask {
    id: string;
    minutes: number | null;
    notBefore: LocalDate | null;
}

export interface FitDayResult {
    placed: { taskId: string; start: Instant; end: Instant }[];
    /** Sized, but no gap left. They stay on their day. */
    didntFit: string[];
    notSized: string[];
}

/** A task's length for this run: its estimate, else a supported guess. Never the 60-minute fallback, never a tentative guess. */
export const fitMinutes = (task: { durationEstimate: number | null }, guess?: Pick<DurationGuess, "state" | "minutes"> | null): number | null =>
    task.durationEstimate || (guess?.state === "supported" ? guess.minutes : null);

export type FitDayInput = Omit<FindTimeInput, "task" | "preferred">;

/** Today's own set: open, untimed, not Waiting, not Fixed, not a repeating series, one day long. */
export const isFitCandidate = (task: {
    state: string;
    scheduledStart: Instant | null;
    interactionMode?: string | null;
    recurrenceRule?: string | null;
    seriesId?: string | null;
    isRecurringInstance?: boolean | null;
    isHabit?: boolean | null;
    dueDate?: LocalDate | null;
    endDate?: LocalDate | null;
}) =>
    task.state === "ACTIVE" && !task.scheduledStart && task.interactionMode !== "timetable" && !task.recurrenceRule && !task.seriesId &&
    !task.isRecurringInstance && !task.isHabit && (!task.endDate || task.endDate === task.dueDate);

/**
 * Each sized task, in the order given (the person's intent: nothing is re-ranked), takes `findTimes`' first proposal
 * with every block already placed in this run counted as busy, so the 15-minute buffer keeps them apart. `preferredOf`
 * gives a task's own preferred parts of the day (a stated preference applies by topic), from the buckets with room for it.
 */
export function fitDay<T extends FitTask>(tasks: readonly T[], input: FitDayInput, preferredOf: (task: T, feasible: TimeOfDay[]) => TimeOfDay[]): FitDayResult {
    const result: FitDayResult = { placed: [], didntFit: [], notSized: [] };
    const busy = [...input.busy];
    for (const task of tasks) {
        if (!task.minutes || task.minutes < 1) {
            result.notSized.push(task.id);
            continue;
        }
        const rule: FindTimeInput = { ...input, busy, task: { minutes: task.minutes, notBefore: task.notBefore, currentStart: null }, preferred: [] };
        const [first] = findTimes({ ...rule, preferred: preferredOf(task, feasibleBuckets(rule)) });
        if (!first) {
            result.didntFit.push(task.id);
            continue;
        }
        result.placed.push({ taskId: task.id, start: first.start, end: first.end });
        busy.push({ start: first.start, end: first.end });
    }
    return result;
}
