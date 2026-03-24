import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { formatTime } from "../../lib/utils/date-format";
import type { Task } from "../../types/task";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDaysInMonth(y: number, m: number) {
    return new Date(y, m + 1, 0).getDate();
}

function getFirstDayOfWeek(y: number, m: number) {
    const d = new Date(y, m, 1).getDay();
    return d === 0 ? 6 : d - 1; // Monday = 0
}

export interface MonthPeekViewProps {
    year: number;
    month: number;
    currentDate: string;
    datesWithTasks: Set<number>;
    habitDays?: Set<number>;
    holidayDays?: Set<number>;
    birthdayDay?: number | null;
    tasksByDay: Record<number, Task[]>;
    onSelectDate: (day: number) => void;
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
}

export function MonthPeekView({
    year,
    month,
    currentDate,
    datesWithTasks,
    habitDays,
    holidayDays,
    birthdayDay,
    tasksByDay,
    onSelectDate,
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
}: MonthPeekViewProps) {
    const selectedDay = parseInt(currentDate.split("-")[2], 10);
    const todayStr = new Date().toISOString().split("T")[0];
    const todayParts = todayStr.split("-");
    const todayDay = parseInt(todayParts[2], 10);
    const isCurrentMonth = parseInt(todayParts[0], 10) === year && parseInt(todayParts[1], 10) === month + 1;

    const daysInMonth = getDaysInMonth(year, month);
    const firstOffset = getFirstDayOfWeek(year, month);

    const cells = useMemo(() => {
        const arr: (number | null)[] = [];
        for (let i = 0; i < firstOffset; i++) arr.push(null);
        for (let d = 1; d <= daysInMonth; d++) arr.push(d);
        return arr;
    }, [daysInMonth, firstOffset]);

    const agendaDays = useMemo(() => {
        const orderedDays = Object.keys(tasksByDay)
            .map((day) => Number(day))
            .filter((day) => day >= selectedDay)
            .sort((a, b) => a - b);

        if (!orderedDays.includes(selectedDay)) {
            orderedDays.unshift(selectedDay);
        }

        return orderedDays;
    }, [selectedDay, tasksByDay]);

    const handleDaySelect = (day: number) => {
        onSelectDate(day);
    };

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Compact calendar grid */}
            <div className="shrink-0 px-3 pt-2 pb-3 border-b border-twilight-border/20">
                <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.04] text-lantern/85">
                            <CalendarDays size={16} />
                        </span>
                        <span className="truncate text-sm font-medium text-twilight-text-soft">
                            {new Date(year, month, selectedDay).toLocaleDateString("en-US", {
                                month: "long",
                                day: "numeric",
                            })}
                        </span>
                    </div>
                    <div className="rounded-full border border-white/[0.08] px-3 py-1 text-[11px] font-medium tabular-nums text-twilight-text-soft">
                        {datesWithTasks.size}
                    </div>
                </div>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                    {WEEKDAY_LABELS.map((d) => (
                        <div key={d} className="text-center text-[10px] text-twilight-text-muted/80 uppercase font-semibold py-0.5">
                            {d}
                        </div>
                    ))}
                </div>
                {/* Day cells */}
                <div className="grid grid-cols-7 gap-0.5">
                    {cells.map((day, i) => {
                        if (!day) return <div key={i} />;
                        const isToday = isCurrentMonth && day === todayDay;
                        const isSelected = day === selectedDay;
                        const hasTask = datesWithTasks.has(day);

                        return (
                            <button
                                key={i}
                                type="button"
                                onClick={() => handleDaySelect(day)}
                                className={`
                                    relative aspect-square flex items-center justify-center text-[12px] rounded-lg
                                    transition-colors duration-150 cursor-pointer
                                    ${isToday ? "bg-lantern/20 text-lantern ring-1 ring-lantern font-bold" : ""}
                                    ${isSelected && !isToday ? "bg-white/[0.1] text-twilight-text ring-1 ring-white/15" : ""}
                                    ${!isToday && !isSelected ? "text-twilight-text-muted hover:bg-white/[0.05]" : ""}
                                `}
                            >
                                {day}
                                {hasTask && !isToday && (
                                    <span className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-lantern/50" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Selected day agenda */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-24">
                <div className="sticky top-0 z-10 -mx-1 border-b border-twilight-border/15 bg-twilight-deep/88 px-1 py-3 backdrop-blur-xl">
                    <span className="text-[13px] font-semibold text-twilight-text-soft">
                        {new Date(year, month, selectedDay).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                        })}
                    </span>
                </div>

                <div className="flex flex-col gap-5 py-4">
                    {agendaDays.length === 0 ? (
                        <div className="flex items-center justify-center py-8 text-sm text-twilight-text-muted/50">
                            Nothing scheduled
                        </div>
                    ) : agendaDays.map((day) => {
                        const dayTasks = tasksByDay[day] ?? [];

                        return (
                            <section key={day} className="space-y-2">
                                <button
                                    type="button"
                                    onClick={() => handleDaySelect(day)}
                                    className="flex w-full items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left"
                                >
                                    <span className="text-sm font-semibold text-twilight-text">
                                        {new Date(year, month, day).toLocaleDateString("en-US", {
                                            weekday: "long",
                                            month: "short",
                                            day: "numeric",
                                        })}
                                    </span>
                                    <span className="text-xs tabular-nums text-twilight-text-muted">
                                        {dayTasks.length > 0 ? String(dayTasks.length) : "-"}
                                    </span>
                                </button>

                                {dayTasks.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-white/[0.07] px-3 py-3 text-sm text-twilight-text-muted/70">
                                        Open
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        {dayTasks.map((t) => (
                                            <div
                                                key={t.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => onSelectTask(t.id)}
                                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectTask(t.id); } }}
                                                className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2.5 text-left transition-colors active:bg-white/[0.08]"
                                            >
                                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                    <span className="truncate text-[13px] font-medium text-twilight-text-soft">
                                                        {t.title}
                                                    </span>
                                                    {t.scheduledStart ? (
                                                        <span className="text-[11px] text-twilight-text-muted/80">
                                                            {formatTime(t.scheduledStart)}
                                                            {t.scheduledEnd ? ` – ${formatTime(t.scheduledEnd)}` : ""}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); onCompleteTask(t.id); }}
                                                    className="h-7 w-7 shrink-0 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                                                >
                                                    <span className="h-2 w-2 rounded-full border border-twilight-text-muted/50" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
