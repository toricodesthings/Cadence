import { useMemo, type ReactNode } from "react";
import type { Habit } from "@cadence/contracts/habit";
import { sortRoutines, type RoutineSort } from "../../lib/utils/habits";
import { SortableRoutines } from "./SortableRoutines";
import { useRovingGrid } from "../../hooks/ui/use-roving-grid";
import { isLoggable, logsByDay, RoutineWeekHeader, RoutineWeekRow, type RoutineDay } from "./RoutineWeekRow";
import { CheeringOnSection } from "./RoutineShareMeta";

export function HabitsCanvas({
    days,
    habits,
    sort,
    onSortChange,
    today,
    stacked,
    showStreaks,
    showWeekCount,
    bloom,
    selectedHabitId,
    onSelectHabit,
    lead,
    empty,
}: {
    days: RoutineDay[];
    habits: Habit[];
    sort: RoutineSort;
    onSortChange: (sort: RoutineSort) => void;
    today: string;
    stacked: boolean;
    showStreaks: boolean;
    showWeekCount: boolean;
    bloom: boolean;
    selectedHabitId: string | null;
    onSelectHabit: (id: string) => void;
    lead?: ReactNode;
    empty: ReactNode;
}) {
    const ownHabits = useMemo(() => habits.filter((h) => h.access !== "view"), [habits]);
    const cheeringHabits = useMemo(() => habits.filter((h) => h.access === "view"), [habits]);
    const sorted = useMemo(() => sortRoutines(ownHabits, sort), [ownHabits, sort]);
    const firstCell = useMemo(() => {
        for (const [row, habit] of sorted.entries()) {
            const logs = logsByDay(habit);
            const col = days.findIndex((day) => isLoggable(logs.get(day.iso), day.iso, today));
            if (col >= 0) return { row, col };
        }
        return null;
    }, [sorted, days, today]);
    const { gridProps, tabIndexFor } = useRovingGrid(firstCell);

    const rowsOf = (ordered: Habit[]) =>
        ordered.map((habit, row) => (
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
            />
        ));

    return (
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-28 scrollbar-thin sm:px-6">
            {lead}
            {sorted.length === 0 && cheeringHabits.length === 0 ? (
                empty
            ) : sorted.length === 0 ? null : stacked ? (
                <SortableRoutines habits={sorted} sort={sort} onSortChange={onSortChange} layout="list">
                    {(ordered) => (
                        <div
                            role="group"
                            aria-label="Routines this week"
                            {...gridProps}
                            className="flex flex-col gap-3"
                        >
                            {rowsOf(ordered)}
                        </div>
                    )}
                </SortableRoutines>
            ) : (
                <div
                    role="grid"
                    aria-label="Routines this week"
                    {...gridProps}
                    className="surface-card min-w-[36rem] rounded-[24px] p-2"
                >
                    <RoutineWeekHeader days={days} today={today} showWeekCount={showWeekCount} role="row" />
                    <SortableRoutines habits={sorted} sort={sort} onSortChange={onSortChange} layout="list">
                        {(ordered) => (
                            <div className="mt-1 flex flex-col [&>*:first-child_[data-today]]:rounded-t-2xl [&>*:last-child_[data-today]]:rounded-b-2xl">
                                {rowsOf(ordered)}
                            </div>
                        )}
                    </SortableRoutines>
                </div>
            )}
            <CheeringOnSection
                habits={cheeringHabits}
                days={days}
                today={today}
                selectedHabitId={selectedHabitId}
                onSelectHabit={onSelectHabit}
            />
        </div>
    );
}
