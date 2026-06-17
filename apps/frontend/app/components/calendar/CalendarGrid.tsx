import { useMemo } from "react";
import { CalendarDayCell } from "./CalendarDayCell";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "@cadence/contracts/task";

const DAYS_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAYS_FULL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDaysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate();
}

function getFirstDayOfWeek(y: number, m: number) {
    const d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1;
}

interface CalendarGridProps {
    year: number;
    month: number;
    selectedDate: string; // "YYYY-MM-DD"
    datesWithTasks: Set<number>;
    /** Days that have habits (show a lantern dot indicator, not chips) */
    habitDays?: Set<number>;
    /** Days that have holidays (show a warmer ember marker) */
    holidayDays?: Set<number>;
    /** Day number of user's birthday in this month (if applicable) */
    birthdayDay?: number | null;
    /** Days that have personal events (show a warm rose marker) */
    personalEventDays?: Set<number>;
    /** Count of personal events per day for density-aware markers */
    personalEventCountsByDay?: Record<number, number>;
    onSelectDate: (day: number) => void;
    /** "compact" = sidebar/picker, "full" = schedule page */
    variant?: "compact" | "full";
    /**
     * Full variant only — tasks grouped by day-number.
     * Used to render CalendarTaskChip inside each cell.
     */
    tasksByDay?: Record<number, Task[]>;
    onSelectTask?: (taskId: string) => void;
    onCompleteTask?: (taskId: string) => void;
    onArchiveTask?: (taskId: string) => void;
    /** Right-click callback for creating a task via popover */
    onContextAdd?: (info: CalendarEventInfo) => void;
}

/** 7-column grid of calendar day cells — adapts to compact or full layout */
export function CalendarGrid({
    year,
    month,
    selectedDate,
    datesWithTasks,
    habitDays,
    holidayDays,
    birthdayDay,
    personalEventDays,
    personalEventCountsByDay,
    onSelectDate,
    variant = "compact",
    tasksByDay,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
    onContextAdd,
}: CalendarGridProps) {
    const today = new Date();

    const cells = useMemo(() => {
        const total = getDaysInMonth(year, month);
        const first = getFirstDayOfWeek(year, month);
        const arr: (number | null)[] = [];
        for (let i = 0; i < first; i++) arr.push(null);
        for (let d = 1; d <= total; d++) arr.push(d);
        if (variant === "compact") {
            while (arr.length < 42) arr.push(null);
        }
        return arr;
    }, [month, variant, year]);

    const selectedDay = (() => {
        const parts = selectedDate.split("-");
        const selYear = parseInt(parts[0]);
        const selMonth = parseInt(parts[1]) - 1;
        const selDay = parseInt(parts[2]);
        if (selYear === year && selMonth === month) return selDay;
        return -1;
    })();

    const isCompact = variant === "compact";
    const dayLabels = isCompact ? DAYS_SHORT : DAYS_FULL;

    return (
        <div className={isCompact ? "" : "h-full flex flex-col"}>
            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 mb-1 shrink-0">
                {dayLabels.map((d) => (
                    <div
                        key={d}
                        className={`text-center uppercase py-1.5
                            ${isCompact
                                ? "text-[10px] text-twilight-text-soft tracking-widest font-semibold"
                                : "pb-4 text-[12px] font-semibold text-twilight-text-soft tracking-[0.18em]"
                            }`}
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* Day cells */}
            <div className={`grid grid-cols-7 ${isCompact ? "grid-rows-6 gap-0.5" : "gap-1.5 flex-1 auto-rows-[1fr]"}`}>
                {cells.map((day, i) => (
                    <CalendarDayCell
                        key={i}
                        day={day}
                        isToday={
                            day !== null &&
                            day === today.getDate() &&
                            month === today.getMonth() &&
                            year === today.getFullYear()
                        }
                        isSelected={day === selectedDay}
                        hasTask={day !== null && datesWithTasks.has(day)}
                        hasHabit={day !== null && (habitDays?.has(day) ?? false)}
                        hasHoliday={day !== null && (holidayDays?.has(day) ?? false)}
                        hasBirthday={day !== null && day === birthdayDay}
                        hasPersonalEvent={day !== null && (personalEventDays?.has(day) ?? false)}
                        personalEventCount={day !== null ? (personalEventCountsByDay?.[day] ?? 0) : 0}
                        onSelect={onSelectDate}
                        variant={variant}
                        tasks={day !== null ? (tasksByDay?.[day] ?? []) : []}
                        onSelectTask={onSelectTask}
                        onCompleteTask={onCompleteTask}
                        onArchiveTask={onArchiveTask}
                        year={year}
                        month={month}
                        onContextAdd={onContextAdd}
                    />
                ))}
            </div>
        </div>
    );
}
