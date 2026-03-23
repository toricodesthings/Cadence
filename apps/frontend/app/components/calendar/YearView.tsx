import { useMemo } from "react";
import type { Task } from "../../types/task";
import { toISODate, parseLocalDate } from "../../lib/utils/date-format";
import { toTaskDateOnly } from "../../lib/utils/task/task-scheduling";

const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

function getDaysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate();
}

function getFirstDayOfWeek(y: number, m: number) {
    const d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1; // Monday = 0
}

interface MiniMonthProps {
    year: number;
    month: number;
    taskDateCounts: Map<string, number>;
    holidayDateSet?: Set<string>;
    /** ISO date string of user's birthday this year */
    birthdayDate?: string | null;
    /** Set of ISO date strings that have personal events */
    personalEventDateSet?: Set<string>;
    today: Date;
    /** Jump to month view for this month */
    onSelectMonth: (month: number) => void;
    /** Jump to day view for a specific day */
    onSelectDay: (dateStr: string) => void;
}

function MiniMonth({
    year,
    month,
    taskDateCounts,
    holidayDateSet,
    birthdayDate,
    personalEventDateSet,
    today,
    onSelectMonth,
    onSelectDay,
}: MiniMonthProps) {
    const todayStr = toISODate(today);
    const daysInMonth = getDaysInMonth(year, month);
    const firstOffset = getFirstDayOfWeek(year, month);

    const cells = useMemo(() => {
        const arr: (number | null)[] = [];
        for (let i = 0; i < firstOffset; i++) arr.push(null);
        for (let d = 1; d <= daysInMonth; d++) arr.push(d);
        return arr;
    }, [year, month, daysInMonth, firstOffset]);

    const monthStr = String(month + 1).padStart(2, "0");

    return (
        <div className="glass rounded-2xl p-4 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors">
            {/* Month name */}
            <button
                type="button"
                onClick={() => onSelectMonth(month)}
                className="font-display text-[14px] font-semibold text-twilight-text-soft hover:text-lantern transition-colors cursor-pointer text-left pb-1"
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
                    const dayStr = `${year}-${monthStr}-${String(day).padStart(2, "0")}`;
                    const isToday = dayStr === todayStr;
                    const taskCount = taskDateCounts.get(dayStr) ?? 0;
                    const hasHoliday = holidayDateSet?.has(dayStr) ?? false;
                    const isBirthday = birthdayDate === dayStr;
                    const hasPersonalEvent = personalEventDateSet?.has(dayStr) ?? false;

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
                                    ? "bg-lantern/20 text-lantern ring-1 ring-lantern font-bold"
                                    : "text-twilight-text-muted/90 hover:bg-white/[0.05] hover:text-twilight-text-soft"}
                            `}
                            style={taskCount > 0 && !isToday ? { backgroundColor: `rgba(232, 164, 74, ${heatOpacity})` } : undefined}
                        >
                            {day}
                            {hasHoliday && (
                                <span className="absolute right-[3px] top-[3px] h-[4px] w-[4px] rounded-full bg-solstice shadow-[0_0_6px_rgba(217,106,59,0.4)]" />
                            )}
                            {isBirthday && (
                                <span className="absolute left-[3px] top-[3px] h-[4px] w-[4px] rounded-full bg-violet shadow-[0_0_6px_rgba(155,114,207,0.4)]" />
                            )}
                            {hasPersonalEvent && (
                                <span className="absolute left-1/2 -translate-x-1/2 top-[3px] h-[4px] w-[4px] rounded-full bg-personal shadow-[0_0_6px_rgba(207,114,168,0.4)]" />
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
    holidayDateSet?: Set<string>;
    /** ISO date string of user's birthday this year */
    birthdayDate?: string | null;
    /** Set of ISO date strings with personal events */
    personalEventDateSet?: Set<string>;
    /** Switch to month view for a specific month */
    onSelectMonth: (month: number) => void;
    /** Switch to day view for a specific day */
    onSelectDay: (dateStr: string) => void;
}

export function YearView({ year, tasks, holidayDateSet, birthdayDate, personalEventDateSet, onSelectMonth, onSelectDay }: YearViewProps) {
    const today = new Date();

    // Build a map of ISO dates → task count for heatmap density
    const taskDateCounts = useMemo(() => {
        const map = new Map<string, number>();
        for (const t of tasks) {
            const scheduledStart = toTaskDateOnly(t.scheduledStart);
            const dueDate = toTaskDateOnly(t.dueDate);

            if (scheduledStart) map.set(scheduledStart, (map.get(scheduledStart) ?? 0) + 1);
            if (dueDate && dueDate !== scheduledStart) map.set(dueDate, (map.get(dueDate) ?? 0) + 1);
        }
        return map;
    }, [tasks]);

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
                        today={today}
                        onSelectMonth={onSelectMonth}
                        onSelectDay={onSelectDay}
                    />
                ))}
            </div>
        </div>
    );
}
