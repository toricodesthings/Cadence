import { useMemo } from "react";
import type { LocalDate } from "@cadence/domain/time";
import { getDaysInMonth, getFirstDayOfWeek, isoDay, weekdayLabels } from "../../lib/utils/date-format";
import { useToday } from "../../lib/utils/user-zone";
import { CalendarDayCell } from "./CalendarDayCell";
import type { CalendarEventInfo } from "./CalendarEventPopover";
import type { Task } from "@cadence/contracts/task";

const DAYS_SHORT = weekdayLabels(2);
const DAYS_FULL = weekdayLabels(3);

interface CalendarGridProps {
    year: number;
    month: number;
    /** The selected day, or "" for none */
    selectedDate: LocalDate | "";
    datesWithTasks: Set<LocalDate>;
    /** Days that have habits (show a lantern dot indicator, not chips) */
    habitDays?: Set<LocalDate>;
    /** Days that have holidays (show a warmer ember marker) */
    holidayDays?: Set<LocalDate>;
    /** The user's birthday this year (if it falls in this month) */
    birthdayDate?: LocalDate | null;
    /** Days that have personal events (show a warm rose marker) */
    personalEventDays?: Set<LocalDate>;
    /** Count of personal events per day for density-aware markers */
    personalEventCountsByDay?: Record<LocalDate, number>;
    onSelectDate: (day: LocalDate) => void;
    /** "compact" = sidebar/picker, "full" = schedule page */
    variant?: "compact" | "full";
    /**
     * Full variant only — tasks grouped by LocalDate.
     * Used to render CalendarTaskChip inside each cell.
     */
    tasksByDay?: Record<LocalDate, Task[]>;
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
    birthdayDate,
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
    const today = useToday();

    const cells = useMemo(() => {
        const total = getDaysInMonth(year, month);
        const first = getFirstDayOfWeek(year, month);
        const arr: (LocalDate | null)[] = [];
        for (let i = 0; i < first; i++) arr.push(null);
        for (let d = 1; d <= total; d++) arr.push(isoDay(year, month, d));
        if (variant === "compact") {
            while (arr.length < 42) arr.push(null);
        }
        return arr;
    }, [month, variant, year]);

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
                        key={day ?? `blank-${i}`}
                        day={day}
                        isToday={day === today}
                        isSelected={day !== null && day === selectedDate}
                        hasTask={day !== null && datesWithTasks.has(day)}
                        hasHabit={day !== null && (habitDays?.has(day) ?? false)}
                        hasHoliday={day !== null && (holidayDays?.has(day) ?? false)}
                        hasBirthday={day !== null && day === birthdayDate}
                        hasPersonalEvent={day !== null && (personalEventDays?.has(day) ?? false)}
                        personalEventCount={day !== null ? (personalEventCountsByDay?.[day] ?? 0) : 0}
                        onSelect={onSelectDate}
                        variant={variant}
                        tasks={day !== null ? (tasksByDay?.[day] ?? []) : []}
                        onSelectTask={onSelectTask}
                        onCompleteTask={onCompleteTask}
                        onArchiveTask={onArchiveTask}
                        onContextAdd={onContextAdd}
                    />
                ))}
            </div>
        </div>
    );
}
