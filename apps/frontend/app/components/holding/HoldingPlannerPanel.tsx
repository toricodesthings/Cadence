import { useState, useMemo } from "react";
import { useSearchParams } from "react-router";
import { CalendarHeader } from "../calendar/CalendarHeader";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { useTasks } from "../../hooks/tasks";
import { useAllHabits } from "../../hooks/habits/use-habits";
import { useInbox } from "../../hooks/inbox";
import { toISODate, getMonthDateRange, parseLocalDate, addDays, getDateFormatConfig } from "../../lib/utils/date-format";
import { toTaskDateOnly } from "../../lib/utils/task-scheduling";
import { CalendarDays, Inbox as InboxIcon, CheckSquare } from "lucide-react";
import { useRightPanelStore } from "../../stores/right-panel-store";

// ── Helpers ───────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isDueOnDay(rrule: string, date: Date): boolean {
    if (rrule === "FREQ=DAILY") return true;
    const byDayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
    if (!byDayMatch) return true; // fallback to daily
    const dayAbbrevs = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    const days = byDayMatch[1].split(",");
    return days.includes(dayAbbrevs[date.getDay()]);
}

function workloadLabel(taskCount: number, habitCount: number): string {
    const total = taskCount + habitCount;
    if (total === 0) return "Clear";
    if (total <= 3) return "Light";
    if (total <= 6) return "Moderate";
    return "Full";
}

// ── Component ─────────────────────────────────────────────────────

export function HoldingPlannerPanel() {
    const [searchParams, setSearchParams] = useSearchParams();
    const today = new Date();
    const [year, setYear] = useState(today.getFullYear());
    const [month, setMonth] = useState(today.getMonth());

    // Fetch month tasks for calendar dots
    const monthRange = getMonthDateRange(year, month);
    const { data: monthTasks } = useTasks({ state: "ACTIVE", scheduledRange: monthRange });

    // Build dates with tasks
    const datesWithTasks = useMemo(() => {
        const set = new Set<number>();
        for (const t of monthTasks ?? []) {
            const dateStr = t.scheduledStart ?? t.dueDate;
            if (!dateStr) continue;
            const d = parseLocalDate(dateStr);
            if (d.getFullYear() === year && d.getMonth() === month) {
                set.add(d.getDate());
            }
        }
        return set;
    }, [monthTasks, year, month]);

    const selectedDate = searchParams.get("date") ?? toISODate(today);

    // Fetch tasks scheduled on the selected date
    const { data: dayTasks = [] } = useTasks({
        state: "ACTIVE",
        scheduledRange: { start: selectedDate, end: toISODate(addDays(parseLocalDate(selectedDate), 1)) },
    });

    // Habits due on selected date
    const { data: allHabits = [] } = useAllHabits();
    const selectedDateObj = parseLocalDate(selectedDate);
    const habitsOnDay = useMemo(
        () => allHabits.filter(h => !h.archived && isDueOnDay(h.recurrenceRule, selectedDateObj)),
        [allHabits, selectedDateObj],
    );

    // Inbox stats
    const { data: inboxItems = [] } = useInbox();
    const unprocessedCount = inboxItems.filter(i => !i.processed).length;

    // Unmanaged tasks (no date, no project)
    const { data: allTasks = [] } = useTasks({});
    const unmanagedCount = useMemo(
        () => allTasks.filter(t => t.state === "ACTIVE" && !t.dueDate && !t.scheduledStart && !t.projectId).length,
        [allTasks],
    );

    const handleSelectDate = (day: number) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("date", dateStr);
            return next;
        });
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
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("date", toISODate(today));
            return next;
        });
    };

    const locale = getDateFormatConfig().dateStyle === "dmy" ? "en-GB" : "en-US";
    const dayLabel = selectedDateObj.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
    const load = workloadLabel(dayTasks.length, habitsOnDay.length);

    return (
        <div className="flex h-full flex-col overflow-hidden">
            {/* ── Compact Calendar ── */}
            <div className="p-4 pb-2">
                <div className="glass rounded-2xl p-4 flex flex-col gap-3 min-w-0 overflow-hidden">
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
                </div>
            </div>

            {/* ── Selected-Day Runway ── */}
            <div className="flex-1 overflow-y-auto px-4">
                <div className="pb-2">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="font-display text-base font-semibold text-twilight-text">{dayLabel}</h3>
                            <p className="text-xs text-twilight-text-muted/70 mt-1">
                                {load} · {dayTasks.length} task{dayTasks.length !== 1 ? "s" : ""}, {habitsOnDay.length} habit{habitsOnDay.length !== 1 ? "s" : ""}
                            </p>
                        </div>
                    </div>

                    {dayTasks.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-medium text-twilight-text-muted/50 uppercase tracking-wider mb-2">
                                Scheduled Tasks
                            </p>
                            <div className="flex flex-col gap-1.5">
                                {dayTasks.slice(0, 8).map(t => (
                                    <div key={t.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-sm text-twilight-text-soft bg-white/[0.02] border border-twilight-border/30">
                                        <CheckSquare size={12} className="text-twilight-text-muted shrink-0" aria-hidden="true" />
                                        <span className="truncate">{t.title}</span>
                                    </div>
                                ))}
                                {dayTasks.length > 8 && (
                                    <p className="text-xs text-twilight-text-muted/60 px-3">
                                        +{dayTasks.length - 8} more
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {habitsOnDay.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-medium text-twilight-text-muted/50 uppercase tracking-wider mb-2">
                                Habits Due
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {habitsOnDay.map(h => (
                                    <span key={h.id} className="text-sm text-twilight-text-soft bg-white/[0.03] border border-twilight-border/30 px-3 py-1.5 rounded-xl">
                                        {h.title}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {dayTasks.length === 0 && habitsOnDay.length === 0 && (
                        <div className="py-6 text-center">
                            <CalendarDays size={24} className="mx-auto text-twilight-text-muted/40 mb-2" aria-hidden="true" />
                            <p className="text-sm text-twilight-text-muted/60">
                                Nothing scheduled
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Context Strip ── */}
            <div className="border-t border-twilight-border px-4 py-4">
                <div className="flex items-center justify-between text-xs text-twilight-text-muted/60">
                    <div className="flex items-center gap-2">
                        <CheckSquare size={12} aria-hidden="true" />
                        <span>Unmanaged: {unmanagedCount}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <InboxIcon size={12} aria-hidden="true" />
                        <span>Captures: {unprocessedCount}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
