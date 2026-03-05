import { useMemo } from "react";
import type { Task } from "../../types/task";
import { toISODate, parseLocalDate } from "../../lib/utils/date-format";

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
    taskDateSet: Set<string>; // ISO dates with tasks YYYY-MM-DD
    today: Date;
    /** Jump to month view for this month */
    onSelectMonth: (month: number) => void;
    /** Jump to day view for a specific day */
    onSelectDay: (dateStr: string) => void;
}

function MiniMonth({
    year,
    month,
    taskDateSet,
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
        <div className="glass rounded-2xl p-3 flex flex-col gap-1.5 hover:bg-white/[0.02] transition-colors">
            {/* Month name */}
            <button
                type="button"
                onClick={() => onSelectMonth(month)}
                className="font-display text-[13px] font-semibold text-twilight-text-soft hover:text-lantern transition-colors cursor-pointer text-left"
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
                    const hasTask = taskDateSet.has(dayStr);

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
                        >
                            {day}
                            {hasTask && !isToday && (
                                <span className="absolute bottom-[1px] left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-lantern/60" />
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
    /** Switch to month view for a specific month */
    onSelectMonth: (month: number) => void;
    /** Switch to day view for a specific day */
    onSelectDay: (dateStr: string) => void;
}

export function YearView({ year, tasks, onSelectMonth, onSelectDay }: YearViewProps) {
    const today = new Date();

    // Build a set of all ISO dates that have at least one task
    const taskDateSet = useMemo(() => {
        const set = new Set<string>();
        for (const t of tasks) {
            if (t.scheduledStart) set.add(toISODate(parseLocalDate(t.scheduledStart)));
            if (t.dueDate) set.add(toISODate(parseLocalDate(t.dueDate)));
        }
        return set;
    }, [tasks]);

    return (
        <div className="h-full overflow-y-auto">
            <div className="grid grid-cols-3 gap-4 p-1 pb-6">
                {Array.from({ length: 12 }, (_, m) => (
                    <MiniMonth
                        key={m}
                        year={year}
                        month={m}
                        taskDateSet={taskDateSet}
                        today={today}
                        onSelectMonth={onSelectMonth}
                        onSelectDay={onSelectDay}
                    />
                ))}
            </div>
        </div>
    );
}
