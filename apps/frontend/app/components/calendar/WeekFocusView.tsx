import { useMemo } from "react";
import { format } from "date-fns";
import { ArrowLeftRight, CalendarRange } from "lucide-react";
import type { HolidayRecord } from "../../lib/holidays/provider";
import type { PersonalEvent } from "../../types/settings";
import type { Task } from "@cadence/contracts/task";
import { DayFocusView } from "./DayFocusView";

interface WeekFocusViewProps {
    weekDates: Date[];
    currentDate: string;
    tasksByDate: Record<string, Task[]>;
    holidaysByDate?: Record<string, HolidayRecord[]>;
    birthdayDate?: string | null;
    personalEventsByDate?: Record<string, PersonalEvent[]>;
    onSelectDate: (dateStr: string) => void;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
}

function toISODate(date: Date) {
    return date.toISOString().slice(0, 10);
}

export function WeekFocusView({
    weekDates,
    currentDate,
    tasksByDate,
    holidaysByDate = {},
    birthdayDate,
    personalEventsByDate = {},
    onSelectDate,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
}: WeekFocusViewProps) {
    const today = toISODate(new Date());

    const rangeLabel = useMemo(() => {
        if (weekDates.length === 0) return "";

        const start = weekDates[0];
        const end = weekDates[weekDates.length - 1];
        const startMonth = format(start, "MMM");
        const endMonth = format(end, "MMM");

        if (startMonth === endMonth) {
            return `${startMonth} ${format(start, "d")}-${format(end, "d")}`;
        }

        return `${startMonth} ${format(start, "d")} - ${endMonth} ${format(end, "d")}`;
    }, [weekDates]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-twilight-border/20 px-4 pb-3 pt-2">
                <div className="flex items-center justify-between gap-3 pb-2">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] text-accent-primary/85">
                            <CalendarRange size={16} />
                        </span>
                        <span className="truncate text-sm font-medium text-twilight-text-soft">
                            {rangeLabel}
                        </span>
                    </div>
                    <span
                        role="img"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] text-twilight-text-soft"
                        aria-label="Swipe left or right to change week"
                    >
                        <ArrowLeftRight size={14} aria-hidden="true" />
                    </span>
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {weekDates.map((date) => {
                        const dateStr = toISODate(date);
                        const dayTasks = tasksByDate[dateStr] ?? [];
                        const selected = dateStr === currentDate;
                        const isToday = dateStr === today;

                        return (
                            <button
                                key={dateStr}
                                type="button"
                                onClick={() => onSelectDate(dateStr)}
                                className={[
                                    "touch-target rounded-2xl border px-2 py-2 text-center transition-colors",
                                    selected
                                        ? "border-accent-primary/35 bg-accent-primary/14 text-accent-primary"
                                        : "border-white/[0.07] bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text",
                                ].join(" ")}
                                aria-pressed={selected}
                            >
                                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-current/70">
                                    {format(date, "EEE")}
                                </div>
                                <div className={[
                                    "mt-1 text-base font-semibold",
                                    isToday && !selected ? "text-accent-primary" : "",
                                ].join(" ")}>
                                    {format(date, "d")}
                                </div>
                                <div className="mt-1 text-[10px] tabular-nums text-current/70">
                                    {dayTasks.length > 0 ? String(dayTasks.length) : "-"}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="min-h-0 flex-1">
                <DayFocusView
                    currentDate={currentDate}
                    tasks={tasksByDate[currentDate] ?? []}
                    holidays={holidaysByDate[currentDate] ?? []}
                    isBirthday={birthdayDate === currentDate}
                    personalEvents={personalEventsByDate[currentDate] ?? []}
                    onSelectTask={onSelectTask}
                    onCompleteTask={onCompleteTask}
                    onArchiveTask={onArchiveTask}
                />
            </div>
        </div>
    );
}