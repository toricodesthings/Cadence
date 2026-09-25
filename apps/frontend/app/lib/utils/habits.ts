import type { Habit } from "@cadence/contracts/habit";
import { PROJECT_ACCENT_OPTIONS } from "../constants/colors";
import { toISODate } from "./date-format";

/**
 * Whether a pause covers `date` (default today). A pause runs from today
 * through `pausedUntil`: it never reaches back over days already past.
 */
export function isRoutinePaused(habit: Pick<Habit, "pausedUntil">, date?: string): boolean {
    const today = toISODate(new Date());
    const day = date ?? today;
    return Boolean(habit.pausedUntil) && day >= today && day <= habit.pausedUntil!;
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

/**
 * Sort: due+overdue timed → due+overdue anytime → remaining timed by targetTime → remaining anytime by sortOrder
 * Paused habits sink to bottom.
 */
export function sortHabits(habits: Habit[]): Habit[] {
    return [...habits].sort((a, b) => {
        const aPaused = isRoutinePaused(a) ? 1 : 0;
        const bPaused = isRoutinePaused(b) ? 1 : 0;
        if (aPaused !== bPaused) return aPaused - bPaused;

        const aDue = a.isDueToday || a.isOverdue ? 0 : 1;
        const bDue = b.isDueToday || b.isOverdue ? 0 : 1;
        if (aDue !== bDue) return aDue - bDue;

        const aTimed = a.targetTime ? 0 : 1;
        const bTimed = b.targetTime ? 0 : 1;
        if (aTimed !== bTimed) return aTimed - bTimed;

        if (a.targetTime && b.targetTime) return a.targetTime.localeCompare(b.targetTime);
        return a.sortOrder - b.sortOrder;
    });
}
