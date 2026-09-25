import { useMemo, type CSSProperties } from "react";
import type { Habit } from "@cadence/contracts/habit";
import { getDaysInMonth, getFirstDayOfWeek, toISODate, weekdayLabels } from "../../lib/utils/date-format";
import { routineTone } from "../../lib/utils/habits";
import { useRovingGrid } from "../../hooks/ui/use-roving-grid";
import { RoutineDayCell } from "./RoutineDayCell";
import { isLoggable, logsByDay } from "./RoutineWeekRow";

/** Check-ins and the longest unbroken run among a month's scheduled days up to today. Never counts misses. */
export function monthStats(habit: Habit, today: string) {
    let checkIns = 0;
    let run = 0;
    let longest = 0;
    for (const log of [...(habit.logs ?? [])].sort((a, b) => a.targetDate.localeCompare(b.targetDate))) {
        if (log.targetDate.slice(0, 10) > today) break;
        if (log.status === "COMPLETED") {
            checkIns++;
            longest = Math.max(longest, ++run);
        } else {
            run = 0;
        }
    }
    return { checkIns, longest };
}

/**
 * A routine's month, weeks starting on `weekStartsOn`; every day that can be
 * logged is a tappable `RoutineDayCell`. `fromFirstWeek` drops the weeks before
 * the routine existed (or its first logged day).
 */
export function RoutineMonthGrid({
    habit,
    year,
    month,
    weekStartsOn,
    today,
    bloom = true,
    fromFirstWeek = false,
    onEdit,
}: {
    habit: Habit;
    year: number;
    month: number;
    weekStartsOn: 0 | 1 | 6;
    today: string;
    bloom?: boolean;
    fromFirstWeek?: boolean;
    onEdit?: () => void;
}) {
    const logs = useMemo(() => logsByDay(habit), [habit]);
    const weeks = useMemo(() => {
        const cells: Array<string | null> = [
            ...Array(getFirstDayOfWeek(year, month, weekStartsOn)).fill(null),
            ...Array.from({ length: getDaysInMonth(year, month) }, (_, i) => toISODate(new Date(year, month, i + 1))),
        ];
        while (cells.length % 7) cells.push(null);
        const rows = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
        if (!fromFirstWeek) return rows;
        const created = new Date(habit.createdAt);
        created.setDate(created.getDate() - 1); // the day before creation can be logged too
        const firstLog = habit.logs?.map((log) => log.targetDate.slice(0, 10)).sort()[0];
        const first = [toISODate(created), firstLog].filter(Boolean).sort()[0]!;
        return rows.filter((row) => row.some((iso) => iso && iso >= first));
    }, [year, month, weekStartsOn, fromFirstWeek, habit.createdAt, habit.logs]);

    const firstCell = useMemo(() => {
        for (const [row, week] of weeks.entries()) {
            const col = week.findIndex((iso) => iso && isLoggable(logs.get(iso), iso, today));
            if (col >= 0) return { row, col };
        }
        return null;
    }, [weeks, logs, today]);
    const { gridProps, tabIndexFor } = useRovingGrid(firstCell);
    if (!weeks.length) return <p className="py-6 text-center text-xs text-twilight-text-muted">Started after this month.</p>;

    return (
        <div role="grid" aria-label={`${habit.title}, ${new Date(year, month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`} {...gridProps} style={{ "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties} className="space-y-2">
            <div role="row" className="grid grid-cols-7 gap-1">
                {weekdayLabels(2, weekStartsOn).map((label) => (
                    <span key={label} role="columnheader" className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-twilight-text-muted">{label}</span>
                ))}
            </div>
            {weeks.map((week, row) => {
                const quiet = !week.some((iso) => iso && logs.has(iso)); // nothing due that week
                return (
                <div key={row} role="row" className="grid grid-cols-7 gap-1.5">
                    {week.map((iso, col) => (
                        <div key={col} role="gridcell" className="flex justify-center">
                            {iso ? (
                                <RoutineDayCell
                                    habit={habit}
                                    date={iso}
                                    log={logs.get(iso)}
                                    today={today}
                                    size="fit"
                                    bloom={bloom}
                                    label={Number(iso.slice(8))}
                                    quiet={quiet}
                                    gridPosition={{ row, col }}
                                    tabIndex={tabIndexFor(row, col)}
                                    onEdit={onEdit}
                                />
                            ) : null}
                        </div>
                    ))}
                </div>
                );
            })}
        </div>
    );
}
