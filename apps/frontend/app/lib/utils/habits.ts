import type { Habit } from "@cadence/contracts/habit";

/**
 * Sort: due+overdue timed → due+overdue anytime → remaining timed by targetTime → remaining anytime by sortOrder
 * Paused habits sink to bottom.
 */
export function sortHabits(habits: Habit[]): Habit[] {
    const now = new Date();
    return [...habits].sort((a, b) => {
        const aPaused = a.pausedUntil && new Date(a.pausedUntil) > now ? 1 : 0;
        const bPaused = b.pausedUntil && new Date(b.pausedUntil) > now ? 1 : 0;
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
