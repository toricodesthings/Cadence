import { useEffect, useMemo, useRef } from "react";
import type { Task } from "@cadence/contracts/task";
import type { LocalDate } from "@cadence/domain/time";
import { getDaysInMonth, getFirstDayOfWeek, isoDay, MONTH_NAMES, weekdayLabels } from "../../lib/utils/date-format";
import { taskDays } from "../../lib/utils/calendar/schedule-day";
import { parseYMD } from "../../lib/utils/calendar/calendar-math";
import { useToday } from "../../lib/utils/user-zone";

const MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));
const DAYS_SHORT = weekdayLabels(1);

interface MiniMonthProps {
    year: number;
    month: number;
    taskDateCounts: Map<LocalDate, number>;
    holidayDateSet?: Set<LocalDate>;
    /** The user's birthday this year */
    birthdayDate?: LocalDate | null;
    /** Days that have personal events */
    personalEventDateSet?: Set<LocalDate>;
    /** Personal event density by day */
    personalEventDateCounts?: Record<LocalDate, number>;
    today: LocalDate;
    /** Jump to month view for this month */
    onSelectMonth: (month: number) => void;
    /** Jump to day view for a specific day */
    onSelectDay: (day: LocalDate) => void;
}

function MiniMonth({
    year,
    month,
    taskDateCounts,
    holidayDateSet,
    birthdayDate,
    personalEventDateSet,
    personalEventDateCounts,
    today,
    onSelectMonth,
    onSelectDay,
}: MiniMonthProps) {
    const todayStr = today;
    const daysInMonth = getDaysInMonth(year, month);
    const firstOffset = getFirstDayOfWeek(year, month);

    const cells = useMemo(() => {
        const arr: (number | null)[] = [];
        for (let i = 0; i < firstOffset; i++) arr.push(null);
        for (let d = 1; d <= daysInMonth; d++) arr.push(d);
        return arr;
    }, [year, month, daysInMonth, firstOffset]);

    return (
        <div className="glass flex flex-col gap-3 rounded-2xl p-4 transition-colors hover:bg-white/[0.02]">
            {/* Month name */}
            <button
                type="button"
                onClick={() => onSelectMonth(month)}
                className="cursor-pointer pb-1 text-left font-display text-[14px] font-semibold text-twilight-text-soft transition-colors hover:text-accent-primary"
            >
                {MONTHS[month]}
            </button>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7">
                {DAYS_SHORT.map((d, i) => (
                    <div key={i} className="text-center text-[10px] text-twilight-text-muted/90 uppercase font-semibold py-0.5">
                        {d}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-0.5">
                {cells.map((day, i) => {
                    if (!day) return <div key={i} />;
                    const dayStr = isoDay(year, month, day);
                    const isToday = dayStr === todayStr;
                    const taskCount = taskDateCounts.get(dayStr) ?? 0;
                    const hasHoliday = holidayDateSet?.has(dayStr) ?? false;
                    const isBirthday = birthdayDate === dayStr;
                    const hasPersonalEvent = personalEventDateSet?.has(dayStr) ?? false;
                    const personalEventCount = personalEventDateCounts?.[dayStr] ?? 0;

                    // Heatmap: opacity scales with density (1→0.25, 2→0.4, 3→0.55, 4+→0.7)
                    const heatOpacity = taskCount === 0 ? 0 : Math.min(0.7, 0.15 + taskCount * 0.15);

                    return (
                        <button
                            key={i}
                            type="button"
                            onClick={() => onSelectDay(dayStr)}
                            className={`
                                relative w-full aspect-square flex items-center justify-center
                                text-[11px] rounded-xl transition-colors duration-150 cursor-pointer
                                ${isToday
                                    ? "bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary font-bold"
                                    : "text-twilight-text-muted/90 hover:bg-white/[0.05] hover:text-twilight-text-soft"}
                            `}
                            style={taskCount > 0 && !isToday ? { backgroundColor: `color-mix(in srgb, var(--accent-primary) ${Math.round(heatOpacity * 100)}%, transparent)` } : undefined}
                        >
                            {day}
                            {hasHoliday && (
                                <span className="absolute right-[3px] top-[3px] h-[4px] w-[4px] rounded-full bg-solstice shadow-[0_0_6px_rgba(217,106,59,0.4)]" />
                            )}
                            {isBirthday && (
                                <span className="absolute left-[3px] top-[3px] h-[4px] w-[4px] rounded-full bg-violet shadow-[0_0_6px_rgba(155,114,207,0.4)]" />
                            )}
                            {hasPersonalEvent && (
                                personalEventCount > 1 ? (
                                    <span className="absolute left-1/2 top-[3px] inline-flex min-w-4 -translate-x-1/2 items-center justify-center rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/18 px-1 text-[8px] font-semibold text-accent-nav-schedule">
                                        {personalEventCount}
                                    </span>
                                ) : (
                                    <span className="absolute left-1/2 -translate-x-1/2 top-[3px] h-[4px] w-[4px] rounded-full bg-accent-nav-schedule shadow-[0_0_6px_color-mix(in_srgb,var(--accent-nav-schedule)_40%,transparent)]" />
                                )
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export interface YearViewProps {
    year: number;
    tasks: Task[];
    holidayDateSet?: Set<LocalDate>;
    /** The user's birthday this year */
    birthdayDate?: LocalDate | null;
    /** Days with personal events */
    personalEventDateSet?: Set<LocalDate>;
    /** Personal event density by day */
    personalEventDateCounts?: Record<LocalDate, number>;
    /** Switch to month view for a specific month */
    onSelectMonth: (month: number) => void;
    /** Switch to day view for a specific day */
    onSelectDay: (day: LocalDate) => void;
    compact?: boolean;
}

export function YearView({ year, tasks, holidayDateSet, birthdayDate, personalEventDateSet, personalEventDateCounts, onSelectMonth, onSelectDay, compact = false }: YearViewProps) {
    const today = useToday();

    // LocalDate → task count, for the heatmap density
    const taskDateCounts = useMemo(() => {
        const map = new Map<LocalDate, number>();
        for (const t of tasks) {
            for (const day of taskDays(t)) map.set(day, (map.get(day) ?? 0) + 1);
        }
        return map;
    }, [tasks]);

    if (compact) {
        return <PhoneYear year={year} taskDateCounts={taskDateCounts} today={today} onSelectMonth={onSelectMonth} />;
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="grid grid-cols-3 gap-4 p-1 pb-6">
                {Array.from({ length: 12 }, (_, m) => (
                    <MiniMonth
                        key={m}
                        year={year}
                        month={m}
                        taskDateCounts={taskDateCounts}
                        holidayDateSet={holidayDateSet}
                        birthdayDate={birthdayDate}
                        personalEventDateSet={personalEventDateSet}
                        personalEventDateCounts={personalEventDateCounts}
                        today={today}
                        onSelectMonth={onSelectMonth}
                        onSelectDay={onSelectDay}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Year on a phone, the way a pocket calendar shows it: twelve small months,
 * each one a single tap target that opens the month. Days are a glance, not
 * buttons; they'd be far too small to hit.
 */
function PhoneYear({ year, taskDateCounts, today, onSelectMonth }: {
    year: number;
    taskDateCounts: Map<LocalDate, number>;
    today: LocalDate;
    onSelectMonth: (month: number) => void;
}) {
    const todayStr = today;
    const { y: todayYear, m: todayMonth } = parseYMD(today);
    const currentRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        currentRef.current?.scrollIntoView({ block: "center" });
    }, [year]);

    return (
        <div className="touch-scroll-y h-full px-3 pb-36 pt-2">
            <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                {Array.from({ length: 12 }, (_, month) => {
                    const isCurrent = todayYear === year && todayMonth === month;
                    const cells = [
                        ...Array.from({ length: getFirstDayOfWeek(year, month) }, () => 0),
                        ...Array.from({ length: getDaysInMonth(year, month) }, (_, i) => i + 1),
                    ];
                    return (
                        <button
                            key={month}
                            ref={isCurrent ? currentRef : undefined}
                            type="button"
                            onClick={() => onSelectMonth(month)}
                            aria-label={`${MONTH_NAMES[month]} ${year}`}
                            className="cursor-pointer rounded-2xl p-1.5 text-left transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <span className={`mb-1.5 block font-display text-[15px] font-semibold ${isCurrent ? "text-accent-primary" : "text-twilight-text"}`}>
                                {MONTHS[month]}
                            </span>
                            <span className="grid grid-cols-7 gap-y-0.5" aria-hidden="true">
                                {cells.map((day, i) => {
                                    if (!day) return <span key={i} />;
                                    const dayStr = isoDay(year, month, day);
                                    const count = taskDateCounts.get(dayStr) ?? 0;
                                    const isToday = dayStr === todayStr;
                                    return (
                                        <span
                                            key={i}
                                            className={`flex aspect-square items-center justify-center rounded-full text-[10.5px] tabular-nums ${
                                                isToday ? "bg-accent-primary font-bold text-twilight-void" : "text-twilight-text-soft"
                                            }`}
                                            style={count > 0 && !isToday ? { backgroundColor: `color-mix(in srgb, var(--accent-primary) ${Math.min(45, 12 + count * 8)}%, transparent)` } : undefined}
                                        >
                                            {day}
                                        </span>
                                    );
                                })}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
