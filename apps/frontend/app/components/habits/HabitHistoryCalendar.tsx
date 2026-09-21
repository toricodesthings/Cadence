import { Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../primitives/Button";
import { useHabitMonthly } from "../../hooks/habits/use-habit-monthly";
import { getDaysInMonth, getFirstDayOfWeek, MONTH_NAMES, weekdayLabels } from "../../lib/utils/date-format";

// ─── Heatmap Calendar ────────────────────────────────────────────────────────

const DOW = weekdayLabels(2, 0);

interface HeatmapCalendarProps {
    habitId: string;
    year: number;
    month: number;
    onNavigate: (delta: number) => void;
}

export function HabitHistoryCalendar({ habitId, year, month, onNavigate }: HeatmapCalendarProps) {
    const { data, isLoading } = useHabitMonthly(habitId, year, month);

    const daysInMonth = getDaysInMonth(year, month);
    const firstDow = getFirstDayOfWeek(year, month, 0);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayDay = isCurrentMonth ? today.getDate() : -1;

    // Build flattened grid: nulls for leading blanks + 1..daysInMonth
    const cells: (number | null)[] = [
        ...Array(firstDow).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    const scheduled = new Set(data?.scheduledDays ?? []);
    const logs = data?.logsByDay ?? {};

    return (
        <div className="flex flex-col gap-3">
            {/* Month nav */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onNavigate(-1)}
                    aria-label="Previous month"
                    className="text-twilight-text-muted hover:text-twilight-text"
                >
                    <ChevronLeft size={15} />
                </Button>
                <span className="text-[13px] font-semibold text-twilight-text tabular-nums">
                    {MONTH_NAMES[month]} {year}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onNavigate(1)}
                    aria-label="Next month"
                    className="text-twilight-text-muted hover:text-twilight-text"
                >
                    <ChevronRight size={15} />
                </Button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1">
                {DOW.map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted pb-1">
                        {d}
                    </div>
                ))}

                {/* Day cells */}
                {isLoading
                    ? cells.map((_, i) => (
                        <div key={i} className="aspect-square rounded-full bg-white/[0.04] animate-pulse" />
                    ))
                    : cells.map((day, i) => {
                        if (day === null) {
                            return <div key={i} />;
                        }

                        const isScheduled = scheduled.has(day);
                        const status = logs[day];
                        const isCompleted = status === "COMPLETED";
                        const isSkipped = status === "SKIPPED";
                        const isToday = day === todayDay;

                        return (
                            <div
                                key={i}
                                title={
                                    !isScheduled
                                        ? undefined
                                        : isCompleted
                                            ? "Completed"
                                            : isSkipped
                                                ? "Skipped"
                                                : "Pending"
                                }
                                className={`
                                    relative aspect-square rounded-full flex items-center justify-center
                                    transition-colors duration-150
                                    ${isToday ? "ring-1 ring-accent-primary/60" : ""}
                                    ${isCompleted
                                        ? "bg-accent-primary/25 shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_15%,transparent)]"
                                        : isSkipped
                                            ? "bg-white/[0.05]"
                                            : isScheduled
                                                ? "bg-white/[0.04]"
                                                : ""}
                                `}
                            >
                                {isCompleted ? (
                                    <Check size={10} className="text-accent-primary" strokeWidth={3} />
                                ) : isSkipped ? (
                                    <X size={9} className="text-twilight-text-muted" />
                                ) : (
                                    <span className={`text-[11px] font-medium ${isToday
                                        ? "text-accent-primary font-bold"
                                        : isScheduled
                                            ? "text-twilight-text-soft"
                                            : "text-twilight-text-muted"
                                        }`}>
                                        {day}
                                    </span>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-accent-primary/25" />
                    <span className="text-[10px] text-twilight-text-muted">Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-white/[0.05]" />
                    <span className="text-[10px] text-twilight-text-muted">Skipped</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-white/[0.04]" />
                    <span className="text-[10px] text-twilight-text-muted">Scheduled</span>
                </div>
            </div>
        </div>
    );
}

