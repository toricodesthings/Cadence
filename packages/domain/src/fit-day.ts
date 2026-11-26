import type { TimeOfDay } from "@cadence/contracts/planning";
import {
    BUFFER_MINUTES,
    busyBlocks,
    dayWindow,
    type DayHours,
    feasibleBuckets,
    findTimes,
    nextGridMark,
    type FindTimeInput,
} from "./find-time";
import { addDays, weekRange, type Instant, type LocalDate, type WeekStart, type Zone } from "./time";
import type { DurationGuess } from "@cadence/nlp/duration";

export interface FitTask {
    id: string;
    minutes: number | null;
    notBefore: LocalDate | null;
}

export interface FitDayResult {
    placed: { taskId: string; start: Instant; end: Instant }[];
    didntFit: string[];
    notSized: string[];
}

export const fitMinutes = (
    task: { durationEstimate: number | null },
    guess?: Pick<DurationGuess, "state" | "minutes"> | null,
): number | null => task.durationEstimate || (guess?.state === "supported" ? guess.minutes : null);

export type FitDayInput = Omit<FindTimeInput, "task" | "preferred">;

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
    task.state === "ACTIVE" &&
    !task.scheduledStart &&
    task.interactionMode !== "timetable" &&
    !task.recurrenceRule &&
    !task.seriesId &&
    !task.isRecurringInstance &&
    !task.isHabit &&
    (!task.endDate || task.endDate === task.dueDate);

export function fitDay<T extends FitTask>(
    tasks: readonly T[],
    input: FitDayInput,
    preferredOf: (task: T, feasible: TimeOfDay[]) => TimeOfDay[],
): FitDayResult {
    const result: FitDayResult = { placed: [], didntFit: [], notSized: [] };
    const busy = [...input.busy];
    for (const task of tasks) {
        if (!task.minutes || task.minutes < 1) {
            result.notSized.push(task.id);
            continue;
        }
        const rule: FindTimeInput = {
            ...input,
            busy,
            task: { minutes: task.minutes, notBefore: task.notBefore, currentStart: null },
            preferred: [],
        };
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
    share?: number;
}

const MIN_MS = 60_000;

export function weekRoom(
    tasks: readonly RoomTask[],
    opts: DayHours & { from: LocalDate; days: number; zone: Zone; now?: Instant },
): DayRoom[] {
    const open = tasks.filter((t) => t.state !== "COMPLETE" && t.state !== "ARCHIVED");
    const blocks = open.flatMap((t) =>
        busyBlocks([t], "").map((b) => [Date.parse(b.start), Date.parse(b.end), t.share ?? 1] as const),
    );
    return Array.from({ length: opts.days }, (_, i) => {
        const day = addDays(opts.from, i);
        const window = dayWindow(day, opts, opts.zone);
        const from = i === 0 && opts.now ? Math.max(window.from, nextGridMark(Date.parse(opts.now))) : window.from;
        const span = Math.max(0, window.to - from);
        const clipped = blocks
            .map(([s, e, w]) => [Math.max(s, from), Math.min(e, window.to), w] as const)
            .filter(([s, e, w]) => e > s && w > 0);
        const marks = [...new Set(clipped.flatMap(([s, e]) => [s, e]))].sort((a, b) => a - b);
        let timed = 0;
        for (let m = 1; m < marks.length; m++) {
            const w = Math.max(
                0,
                ...clipped.filter(([s, e]) => s <= marks[m - 1] && e >= marks[m]).map(([, , x]) => x),
            );
            timed += (marks[m] - marks[m - 1]) * w;
        }
        const due = open.filter((t) => t.dueDate === day);
        const untimed = due
            .filter((t) => !t.scheduledStart)
            .reduce((sum, t) => sum + (t.durationEstimate ?? 0) * (t.share ?? 1), 0);
        const bookedMinutes = Math.min(span / MIN_MS, Math.round(timed / MIN_MS + untimed));
        return {
            day,
            bookedMinutes,
            openMinutes: Math.round(span / MIN_MS - bookedMinutes),
            deadlines: due.map((t) => ({ id: t.id, title: t.title })),
        };
    });
}

export function roomiestDay(room: readonly DayRoom[], minutes: number, opts: { after: LocalDate }): LocalDate | null {
    const later = room.filter((r) => r.day > opts.after);
    const pool = later.length ? later : room;
    const fits = pool.find((r) => r.openMinutes >= minutes + BUFFER_MINUTES);
    if (fits) return fits.day;
    return (
        pool.reduce<DayRoom | null>((best, r) => (!best || r.openMinutes > best.openMinutes ? r : best), null)?.day ??
        null
    );
}

export function dispositionDay(
    bucket: "today" | "this_week" | "next_week",
    opts: { today: LocalDate; room: readonly DayRoom[]; minutes: number; weekStart: WeekStart },
): LocalDate {
    if (bucket === "today") return opts.today;
    const nextWeek = addDays(weekRange(opts.today, opts.weekStart).start, 7);
    if (bucket === "next_week") return nextWeek;
    const thisWeek = opts.room.filter((r) => r.day < nextWeek);
    return roomiestDay(thisWeek, opts.minutes, { after: opts.today }) ?? addDays(opts.today, 1);
}
