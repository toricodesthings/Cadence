import type { Habit } from "@cadence/contracts/habit";
import type { LocalDate } from "@cadence/domain/time";
import { isPausedOn } from "@cadence/domain/repeats";
import { PROJECT_ACCENT_OPTIONS } from "../constants/colors";
import { today as getToday } from "./user-zone";

/**
 * Whether a pause covers `date` (default today). A pause runs from today
 * through `pausedUntil`: it never reaches back over days already past.
 */
export function isRoutinePaused(habit: Pick<Habit, "pausedUntil">, date?: LocalDate): boolean {
    const today = getToday();
    return isPausedOn(habit.pausedUntil, date ?? today, today);
}

/** The DB default ("lantern") and anything unknown mean "no colour picked". */
export const ROUTINE_DEFAULT_ACCENT = "lantern";

/** A routine's tint: its picked colour, otherwise moonlit (the routine tone everywhere). */
export function routineTone(colorAccent: string | null | undefined): string {
    return PROJECT_ACCENT_OPTIONS.find((option) => option.value === colorAccent)?.varName ?? "var(--color-moonlit)";
}

/** Colour choices for a routine: the default tint first, then the list palette. */
export const ROUTINE_SWATCHES = [
    { value: ROUTINE_DEFAULT_ACCENT, color: "var(--color-moonlit)", label: "Default" },
    ...PROJECT_ACCENT_OPTIONS.map((option) => ({ value: option.value as string, color: option.varName as string, label: option.label as string })),
];

export type RoutineSort = "created" | "time" | "name" | "custom";

const byCreated = (a: Habit, b: Habit) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id.localeCompare(b.id);
const firstTime = (habit: Habit) => habit.times?.[0] ?? habit.targetTime ?? null;

/**
 * The Routines page order. Every mode reads only what the person set (created, time, name,
 * their dragged order), never today's progress, so checking one off never moves it.
 */
export function sortRoutines(habits: Habit[], mode: RoutineSort): Habit[] {
    const compare: Record<RoutineSort, (a: Habit, b: Habit) => number> = {
        created: byCreated,
        // Timed first by their first time of day, then anytime routines.
        time: (a, b) => {
            const [ta, tb] = [firstTime(a), firstTime(b)];
            if (ta && tb) return ta.localeCompare(tb) || byCreated(a, b);
            return ta ? -1 : tb ? 1 : byCreated(a, b);
        },
        name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }) || byCreated(a, b),
        custom: (a, b) => a.sortOrder - b.sortOrder || byCreated(a, b),
    };
    return [...habits].sort(compare[mode]);
}

/** A field the person set keeps their value; otherwise what the words say, else the default. */
export function chosen<T>(touched: boolean, own: T, parsed: T | null | undefined): T {
    return touched ? own : (parsed ?? own);
}
