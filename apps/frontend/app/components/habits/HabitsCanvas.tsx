import { useMemo, type ReactNode } from "react";
import type { Habit } from "@cadence/contracts/habit";
import { sortHabits } from "../../lib/utils/habits";
import { useRovingGrid } from "../../hooks/ui/use-roving-grid";
import { isLoggable, logsByDay, RoutineWeekRow, weekGridColumns, type RoutineDay } from "./RoutineWeekRow";

/**
 * The week: one `RoutineWeekRow` per routine under a sticky day header (phone:
 * stacked cards). The grid is one tab stop; arrows move between days, Space
 * toggles, S skips, E opens the routine. `lead` (the Today band) scrolls with it.
 */
export function HabitsCanvas({
    days,
    habits,
    today,
    stacked,
    showStreaks,
    showWeekCount,
    bloom,
    selectedHabitId,
    onSelectHabit,
    onCloseHabit,
    lead,
    empty,
}: {
    days: RoutineDay[];
    habits: Habit[];
    today: string;
    stacked: boolean;
    showStreaks: boolean;
    showWeekCount: boolean;
    bloom: boolean;
    selectedHabitId: string | null;
    onSelectHabit: (id: string) => void;
    onCloseHabit: () => void;
    lead?: ReactNode;
    empty: ReactNode;
}) {
    const sorted = useMemo(() => sortHabits(habits), [habits]);
    const firstCell = useMemo(() => {
        for (const [row, habit] of sorted.entries()) {
            const logs = logsByDay(habit);
            const col = days.findIndex((day) => isLoggable(logs.get(day.iso), day.iso, today));
            if (col >= 0) return { row, col };
        }
        return null;
    }, [sorted, days, today]);
    const { gridProps, tabIndexFor } = useRovingGrid(firstCell);

    const rows = sorted.map((habit, row) => (
        <RoutineWeekRow
            key={habit.id}
            habit={habit}
            days={days}
            today={today}
            row={row}
            stacked={stacked}
            selected={habit.id === selectedHabitId}
            showStreaks={showStreaks}
            showWeekCount={showWeekCount}
            bloom={bloom}
            tabIndexFor={tabIndexFor}
            onSelect={() => onSelectHabit(habit.id)}
            onClose={onCloseHabit}
        />
    ));

    return (
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-28 scrollbar-thin sm:px-6">
            {lead}
            {sorted.length === 0 ? empty : stacked ? (
                <div role="group" aria-label="Routines this week" {...gridProps} className="flex flex-col gap-3">{rows}</div>
            ) : (
                <div role="grid" aria-label="Routines this week" {...gridProps} className="min-w-[36rem]">
                    <div role="row" className={`photo-shell-surface layer-shell-base sticky top-0 grid ${weekGridColumns(showWeekCount)} items-end rounded-2xl bg-twilight-deep/75 px-2 py-2 backdrop-blur-xl`}>
                        <span />
                        {days.map((day) => {
                            const isToday = day.iso === today;
                            return (
                                <span key={day.iso} role="columnheader" className="flex flex-col items-center gap-1">
                                    <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isToday ? "text-accent-primary" : "text-twilight-text-soft"}`}>{day.short}</span>
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium tabular-nums ${isToday ? "bg-accent-primary font-semibold text-[var(--primary-foreground)]" : "text-twilight-text"}`}>{day.dayNum}</span>
                                </span>
                            );
                        })}
                        {showWeekCount ? <span role="columnheader" className="text-right text-[11px] font-medium text-twilight-text-muted">This week</span> : null}
                    </div>
                    {/* Today's cells join into one column, rounded at its ends. */}
                    <div className="mt-1 flex flex-col [&>*:first-child_[data-today]]:rounded-t-2xl [&>*:last-child_[data-today]]:rounded-b-2xl">{rows}</div>
                </div>
            )}
        </div>
    );
}
