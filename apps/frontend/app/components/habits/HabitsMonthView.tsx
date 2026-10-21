import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { Habit } from "@cadence/contracts/habit";
import { isRoutinePaused, routineTone, sortRoutines, type RoutineSort } from "../../lib/utils/habits";
import { DRAGGING, SortableRoutines, useSortableRoutine } from "./SortableRoutines";
import { HabitContextMenu, HabitMenu } from "./HabitMenu";
import { RoutineIdentity, openOnCardClick } from "./RoutineWeekRow";
import { monthStats, RoutineMonthGrid } from "./RoutineMonthGrid";

/** A card per routine: its month (every loggable day tappable) and a neutral footer. */
export function HabitsMonthView({
    year,
    month,
    weekStartsOn,
    habits,
    sort,
    today,
    showStreaks,
    bloom,
    selectedHabitId,
    onSelectHabit,
    trimEarlyWeeks,
    lead,
    empty,
}: {
    year: number;
    month: number;
    weekStartsOn: 0 | 1 | 6;
    habits: Habit[];
    sort: RoutineSort;
    today: string;
    showStreaks: boolean;
    bloom: boolean;
    selectedHabitId: string | null;
    onSelectHabit: (id: string) => void;
    /** Phone: drop the weeks before a routine existed to save height. */
    trimEarlyWeeks: boolean;
    lead?: ReactNode;
    empty: ReactNode;
}) {
    const sorted = useMemo(() => sortRoutines(habits, sort), [habits, sort]);

    return (
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-28 scrollbar-thin sm:px-6">
            {/* Cards share the row (auto-fit), and the band and cards share one
                width, capped per card so one routine isn't a page-wide month. */}
            <div style={{ maxWidth: `${Math.max(sorted.length, 2) * 36}rem` }}>
            {lead}
            {sorted.length === 0 ? empty : (
                <SortableRoutines habits={sorted} sort={sort} layout="grid">
                    {(ordered) => (
                        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-4">
                            {ordered.map((habit) => (
                                <RoutineMonthCard key={habit.id} habit={habit} year={year} month={month} weekStartsOn={weekStartsOn} today={today}
                                    showStreaks={showStreaks} bloom={bloom} trimEarlyWeeks={trimEarlyWeeks} selected={habit.id === selectedHabitId} onSelect={() => onSelectHabit(habit.id)} />
                            ))}
                        </div>
                    )}
                </SortableRoutines>
            )}
            </div>
        </div>
    );
}

function RoutineMonthCard({ habit, year, month, weekStartsOn, today, showStreaks, bloom, trimEarlyWeeks, selected, onSelect }: {
    habit: Habit;
    year: number;
    month: number;
    weekStartsOn: 0 | 1 | 6;
    today: string;
    showStreaks: boolean;
    bloom: boolean;
    trimEarlyWeeks: boolean;
    selected: boolean;
    onSelect: () => void;
}) {
    const sortable = useSortableRoutine(habit);
    const edit = () => { if (!selected) onSelect(); };
    const { checkIns, longest } = monthStats(habit, today);
    const footer = [
        checkIns ? `${checkIns} check-in${checkIns === 1 ? "" : "s"} this month` : "No check-ins yet this month",
        showStreaks && longest > 1 ? `longest run ${longest}` : null,
    ].filter(Boolean).join(" · ");
    return (
        <HabitContextMenu habit={habit} onEdit={edit}>
            <section
                ref={sortable.ref}
                aria-label={habit.title}
                onClick={openOnCardClick(onSelect)}
                style={{ ...sortable.style, "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties}
                className={`group cursor-pointer rounded-[1.5rem] border p-4 sm:p-5 transition-colors ${isRoutinePaused(habit) ? "opacity-60" : ""} ${selected ? "border-[color-mix(in_srgb,var(--routine-tone)_30%,transparent)] bg-[color-mix(in_srgb,var(--routine-tone)_6%,transparent)]" : "surface-card"} ${sortable.isDragging ? DRAGGING : ""}`}
            >
                <div className="flex items-center gap-1">
                    {sortable.grip}
                    <RoutineIdentity habit={habit} today={today} showStreaks={showStreaks} selected={selected} onSelect={onSelect} />
                    <HabitMenu habit={habit} onEdit={edit} />
                </div>
                <div className="mt-4">
                    <RoutineMonthGrid habit={habit} year={year} month={month} weekStartsOn={weekStartsOn} today={today} bloom={bloom} fromFirstWeek={trimEarlyWeeks} onEdit={edit} />
                </div>
                <p className="mt-3 text-xs text-twilight-text-muted">{footer}</p>
            </section>
        </HabitContextMenu>
    );
}
