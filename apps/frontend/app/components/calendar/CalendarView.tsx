import { useState } from "react";
import { useSearchParams } from "react-router";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarGrid } from "./CalendarGrid";
import { useTasks } from "../../hooks/tasks";
import { toISODate, getMonthDateRange, parseLocalDate, addDays, isSameDay, getDateFormatConfig } from "../../lib/utils/date-format";
import { toTaskDateOnly } from "../../lib/utils/task-scheduling";



function formatUpcomingDate(iso: string, today: Date): string {
    const d = parseLocalDate(iso);
    if (isSameDay(d, today)) return "Today";
    if (isSameDay(d, addDays(today, 1))) return "Tomorrow";
    const locale = getDateFormatConfig().dateStyle === "dmy" ? "en-GB" : "en-US";
    return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

/** Calendar container — manages month state, drives date filter via URL params */
export function CalendarView() {
    const [searchParams, setSearchParams] = useSearchParams();
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());

    // Fetch month's tasks silently for dot indicators
    const monthRange = getMonthDateRange(year, month);
    const { data: monthTasks } = useTasks({
        state: "ACTIVE",
        scheduledRange: monthRange,
    });

    // Fetch next 7 days of tasks for upcoming preview
    const next7Range = {
        start: toISODate(today),
        end: toISODate(addDays(today, 7)),
    };
    const { data: upcomingTasks } = useTasks({
        state: "ACTIVE",
        scheduledRange: { start: toISODate(today), end: toISODate(addDays(today, 7)) },
    });

    // Build a set of day-numbers that have scheduled tasks
    const datesWithTasks = new Set(
        (monthTasks ?? [])
            .filter((t) => t.scheduledStart || t.dueDate)
            .map((t) => {
                const dateStr = t.scheduledStart ?? t.dueDate!;
                const d = parseLocalDate(dateStr);
                if (d.getFullYear() === year && d.getMonth() === month) {
                    return d.getDate();
                }
                return null;
            })
            .filter((d): d is number => d !== null),
    );

    const selectedDate = searchParams.get("date") ?? toISODate(today);

    const handleSelectDate = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSearchParams({ date: dateStr });
    };

    const handleNavigate = (delta: number) => {
        let m = month + delta;
        let y = year;
        if (m > 11) { m = 0; y++; }
        if (m < 0) { m = 11; y--; }
        setMonth(m);
        setYear(y);
    };

    const handleToday = () => {
        setYear(today.getFullYear());
        setMonth(today.getMonth());
        setSearchParams({ date: toISODate(today) });
    };

    // Group upcoming tasks by date
    const upcomingByDate = new Map<string, typeof upcomingTasks>();
    (upcomingTasks ?? []).forEach((task) => {
        const dateStr = task.dueDate
            ? toTaskDateOnly(task.dueDate)
            : task.scheduledStart
                ? toTaskDateOnly(task.scheduledStart)
                : null;
        if (!dateStr) return;
        if (!upcomingByDate.has(dateStr)) upcomingByDate.set(dateStr, []);
        upcomingByDate.get(dateStr)!.push(task);
    });

    // Build upcoming rows for next 7 days that have tasks
    const upcomingRows: Array<{ dateIso: string; label: string; tasks: NonNullable<typeof upcomingTasks> }> = [];
    for (let i = 0; i <= 7; i++) {
        const d = addDays(today, i);
        const iso = toISODate(d);
        const tasksOnDay = upcomingByDate.get(iso);
        if (tasksOnDay && tasksOnDay.length > 0) {
            upcomingRows.push({
                dateIso: iso,
                label: formatUpcomingDate(iso + "T00:00:00", today),
                tasks: tasksOnDay,
            });
        }
    }

    return (
        <div className="glass rounded-2xl p-4 flex flex-col gap-4 min-w-0 overflow-hidden">
            <CalendarHeader
                year={year}
                month={month}
                onNavigate={handleNavigate}
                onToday={handleToday}
            />
            <CalendarGrid
                year={year}
                month={month}
                selectedDate={selectedDate}
                datesWithTasks={datesWithTasks}
                onSelectDate={handleSelectDate}
            />

            {/* Upcoming preview */}
            {upcomingRows.length > 0 && (
                <div className="mt-2 min-w-0 overflow-hidden" aria-label="Upcoming tasks">
                    <p className="text-[11px] font-semibold text-twilight-text-muted uppercase tracking-[0.12em] mb-2">
                        Upcoming
                    </p>
                    <div className="flex flex-col gap-1 min-w-0">
                        {upcomingRows.slice(0, 5).map(({ dateIso, label, tasks: dayTasks }) => (
                            <button
                                key={dateIso}
                                onClick={() => {
                                    const parts = dateIso.split("-");
                                    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                                    setYear(d.getFullYear());
                                    setMonth(d.getMonth());
                                    setSearchParams({ date: dateIso });
                                }}
                                aria-label={`View tasks for ${label}: ${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""}`}
                                className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-white/[0.04] transition-colors text-left w-full min-w-0 group"
                            >
                                <span className="text-[12px] font-medium text-twilight-text-muted w-16 shrink-0">
                                    {label}
                                </span>
                                <span className="flex-1 text-[12px] text-twilight-text-soft truncate min-w-0">
                                    {(label === "Today" || label === "Tomorrow") && dayTasks.length === 1
                                        ? dayTasks[0].title
                                        : `${dayTasks.length} task${dayTasks.length !== 1 ? "s" : ""}`}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
