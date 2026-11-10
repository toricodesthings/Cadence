// Fit today: a whole day's untimed tasks laid into its gaps, in one preview. Pure: it proposes, in the person's own
// order, and never moves an existing block, touches a task with a time, shortens, splits or moves anything to another day.
import type { TimeOfDay } from "@cadence/contracts/planning";
import { BUFFER_MINUTES, busyBlocks, dayWindow, feasibleBuckets, findTimes, nextGridMark, type FindTimeInput } from "./find-time";
import { addDays, weekRange, type Instant, type LocalDate, type WeekStart, type Zone } from "./time";
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

/** One day of the week ahead: what's booked, what's open, and what's due. */
export interface DayRoom {
    day: LocalDate;
    bookedMinutes: number;
    openMinutes: number;
    deadlines: { id: string; title: string }[];
}

export interface RoomTask {
    id: string;
    title: string;
    state: string;
    dueDate: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd: Instant | null;
    durationEstimate: number | null;
}

const MIN_MS = 60_000;

/**
 * The room in each of `days` days from `from`, inside the same window Find a time looks in. Booked is the open timed
 * blocks (overlaps counted once) plus the estimates of untimed open tasks due that day; today starts at `now`.
 * ponytail: estimates only, never duration guesses; add them if the week reads too empty.
 */
export function weekRoom(tasks: readonly RoomTask[], opts: { from: LocalDate; days: number; zone: Zone; timelineStartHour: number; now?: Instant }): DayRoom[] {
    const open = tasks.filter((t) => t.state !== "COMPLETE" && t.state !== "ARCHIVED");
    const blocks = busyBlocks(open, "").map((b) => [Date.parse(b.start), Date.parse(b.end)] as const);
    return Array.from({ length: opts.days }, (_, i) => {
        const day = addDays(opts.from, i);
        const window = dayWindow(day, opts.timelineStartHour, opts.zone);
        const from = i === 0 && opts.now ? Math.max(window.from, nextGridMark(Date.parse(opts.now))) : window.from;
        const span = Math.max(0, window.to - from);
        // Clip each block to the window and merge overlaps, so two blocks at once count once.
        const clipped = blocks.map(([s, e]) => [Math.max(s, from), Math.min(e, window.to)] as const).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
        let timed = 0;
        let end = -Infinity;
        for (const [s, e] of clipped) {
            if (e <= end) continue;
            timed += e - Math.max(s, end);
            end = e;
        }
        const due = open.filter((t) => t.dueDate === day);
        const untimed = due.filter((t) => !t.scheduledStart).reduce((sum, t) => sum + (t.durationEstimate ?? 0), 0);
        const bookedMinutes = Math.min(span / MIN_MS, Math.round(timed / MIN_MS) + untimed);
        return { day, bookedMinutes, openMinutes: Math.round(span / MIN_MS - bookedMinutes), deadlines: due.map((t) => ({ id: t.id, title: t.title })) };
    });
}

/** "This week" as a real day: the first day after `after` with room for `minutes` and the buffer, else the one with the most room. */
export function roomiestDay(room: readonly DayRoom[], minutes: number, opts: { after: LocalDate }): LocalDate | null {
    const later = room.filter((r) => r.day > opts.after);
    const pool = later.length ? later : room;
    const fits = pool.find((r) => r.openMinutes >= minutes + BUFFER_MINUTES);
    if (fits) return fits.day;
    return pool.reduce<DayRoom | null>((best, r) => (!best || r.openMinutes > best.openMinutes ? r : best), null)?.day ?? null;
}

/**
 * A reset bucket as a real day: today, the roomiest day later this week, or the first day of next week. The model
 * picks the bucket; this picks the day, so a date is never the model's.
 */
export function dispositionDay(bucket: "today" | "this_week" | "next_week", opts: { today: LocalDate; room: readonly DayRoom[]; minutes: number; weekStart: WeekStart }): LocalDate {
    if (bucket === "today") return opts.today;
    const nextWeek = addDays(weekRange(opts.today, opts.weekStart).start, 7);
    if (bucket === "next_week") return nextWeek;
    const thisWeek = opts.room.filter((r) => r.day < nextWeek);
    return roomiestDay(thisWeek, opts.minutes, { after: opts.today }) ?? addDays(opts.today, 1);
}
