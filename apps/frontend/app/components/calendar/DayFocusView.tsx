import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { Flag, Clock } from "lucide-react";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { Tip } from "../primitives";
import { EmptyState } from "../tasks/EmptyState";
import type { Task } from "@cadence/contracts/task";
import type { HolidayRecord } from "../../lib/holidays/provider";
import type { PersonalEvent } from "../../types/settings";
import { formatTime, toISODate } from "../../lib/utils/date-format";

interface TimeSlot {
    label: string;
    startMinutes: number;
    tasks: Task[];
}

/** Swiping to another day remounts this view, so the offset outlives it —
 *  the same time of day stays in view, the way a native calendar behaves. */
let lastDayScrollTop = 0;

export interface DayFocusViewProps {
    currentDate: string;
    tasks: Task[];
    holidays?: HolidayRecord[];
    isBirthday?: boolean;
    /** Personal events occurring on this day */
    personalEvents?: PersonalEvent[];
    onSelectTask: (id: string) => void;
    onCompleteTask: (id: string) => void;
    onArchiveTask: (id: string) => void;
}

export function DayFocusView({
    currentDate,
    tasks,
    holidays = [],
    isBirthday = false,
    personalEvents = [],
    onSelectTask,
    onCompleteTask,
    onArchiveTask,
}: DayFocusViewProps) {
    const todayIso = toISODate(new Date());
    const isCurrentDate = currentDate === todayIso;
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useLayoutEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollTop = Math.min(lastDayScrollTop, Math.max(0, node.scrollHeight - node.clientHeight));
    }, [currentDate]);

    const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
        lastDayScrollTop = event.currentTarget.scrollTop;
    }, []);

    const { allDay, timed } = useMemo(() => ({
        allDay: tasks.filter((t) => t.isAllDay || !t.scheduledStart),
        timed: tasks
            .filter((t) => !t.isAllDay && !!t.scheduledStart)
            .sort((a, b) => new Date(a.scheduledStart!).getTime() - new Date(b.scheduledStart!).getTime()),
    }), [tasks]);

    // Group timed tasks into hourly slots
    const slots = useMemo(() => {
        const slotMap = new Map<number, Task[]>();
        for (const t of timed) {
            const d = new Date(t.scheduledStart!);
            const hour = d.getHours();
            const existing = slotMap.get(hour) ?? [];
            existing.push(t);
            slotMap.set(hour, existing);
        }
        const result: TimeSlot[] = [];
        for (const [hour, slotTasks] of slotMap) {
            result.push({
                label: `${String(hour).padStart(2, "0")}:00`,
                startMinutes: hour * 60,
                tasks: slotTasks,
            });
        }
        return result.sort((a, b) => a.startMinutes - b.startMinutes);
    }, [timed]);

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const nextTimedTask = timed.find((task) => {
        const taskDate = new Date(task.scheduledStart!);
        return taskDate.getHours() * 60 + taskDate.getMinutes() >= currentMinutes;
    });

    return (
        <div ref={scrollRef} onScroll={handleScroll} className="touch-scroll-y flex flex-col h-full min-h-0 px-4 pb-24">
            {isCurrentDate && (
                <div className="sticky top-0 z-10 -mx-1 mb-2 border-b border-twilight-border/20 bg-twilight-deep/88 px-1 py-3 backdrop-blur-xl">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-accent-primary/20 bg-accent-primary/10 px-3 py-2 text-sm text-accent-primary shadow-[0_12px_30px_color-mix(in_srgb,var(--accent-primary)_12%,transparent)]">
                        <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-accent-primary shadow-[0_0_12px_color-mix(in_srgb,var(--accent-primary)_45%,transparent)]" />
                            <span className="font-semibold">Now {formatTime(now.toISOString())}</span>
                        </div>
                        <span className="text-xs text-accent-primary/80">
                            {nextTimedTask ? `Next: ${nextTimedTask.title}` : "No more timed blocks"}
                        </span>
                    </div>
                </div>
            )}

            {/* Holiday / birthday / personal event banners */}
            {(holidays.length > 0 || isBirthday || personalEvents.length > 0) && (
                <div className="flex flex-col gap-1.5 pt-3 pb-2">
                    {holidays.map((h) => (
                        <div
                            key={h.name}
                            className="inline-flex items-center gap-2 rounded-full border border-solstice/20 bg-solstice/12 px-3 py-1.5 text-xs font-medium text-solstice"
                        >
                            <Flag size={12} strokeWidth={2.2} />
                            {h.name}
                        </div>
                    ))}
                    {isBirthday && (
                        <div className="inline-flex items-center gap-2 rounded-full border border-violet/20 bg-violet/12 px-3 py-1.5 text-xs font-medium text-violet">
                            🎂 Happy Birthday!
                        </div>
                    )}
                    {personalEvents.map((evt) => (
                        <div
                            key={evt.id}
                            className="inline-flex items-center gap-2 rounded-full border border-accent-nav-schedule/20 bg-accent-nav-schedule/12 px-3 py-1.5 text-xs font-medium text-accent-nav-schedule"
                        >
                            {evt.emoji ?? "🎉"} {evt.label}
                        </div>
                    ))}
                </div>
            )}

            {/* All-day tasks */}
            {allDay.length > 0 && (
                <div className="py-3 border-b border-twilight-border/20">
                    <span className="text-[11px] uppercase tracking-wider text-twilight-text-muted/80 font-semibold mb-2 block">
                        All day
                    </span>
                    <div className="flex flex-col gap-1.5">
                        {allDay.map((t) => (
                            <CalendarTaskChip
                                key={t.id}
                                task={t}
                                variant="pill"
                                sourceId={`allday-${currentDate}`}
                                onSelect={onSelectTask}
                                onComplete={onCompleteTask}
                                onArchive={onArchiveTask}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Time slots */}
            {slots.length === 0 && allDay.length === 0 && (
                <div className="flex flex-1 items-center justify-center">
                    <EmptyState variant="schedule" />
                </div>
            )}

            {slots.map((slot) => {
                const isPast = slot.startMinutes / 60 < currentHour;
                const isCurrent = Math.floor(slot.startMinutes / 60) === currentHour;
                return (
                    <div
                        key={slot.startMinutes}
                        className={`py-3 border-b border-twilight-border/10 ${isPast && !isCurrent ? "opacity-50" : ""}`}
                    >
                        <div className="flex items-center gap-2 mb-2">
                            <Clock size={12} className={isCurrent ? "text-accent-primary" : "text-twilight-text-muted/60"} />
                            <span className={`text-[12px] font-medium tabular-nums ${isCurrent ? "text-accent-primary" : "text-twilight-text-muted/80"}`}>
                                {slot.label}
                            </span>
                            {isCurrent && (
                                <span className="text-[10px] text-accent-primary/70 uppercase tracking-wider font-semibold">Now</span>
                            )}
                        </div>
                        <div className="flex flex-col gap-1.5 pl-5">
                            {slot.tasks.map((t) => (
                                <div
                                    key={t.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onSelectTask(t.id)}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectTask(t.id); } }}
                                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white/[0.04] border border-white/[0.06] active:bg-white/[0.08] transition-colors text-left cursor-pointer"
                                >
                                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                        <span className="text-[13px] font-medium text-twilight-text-soft truncate">
                                            {t.title}
                                        </span>
                                        <span className="text-[11px] text-twilight-text-muted/80">
                                            {formatTime(t.scheduledStart!)}
                                            {t.scheduledEnd ? ` – ${formatTime(t.scheduledEnd)}` : ""}
                                        </span>
                                    </div>
                                    <Tip label="Complete task" side="left">
                                        <button
                                            type="button"
                                            aria-label={`Complete ${t.title}`}
                                            onClick={(e) => { e.stopPropagation(); onCompleteTask(t.id); }}
                                            className="touch-target group flex shrink-0 cursor-pointer items-center justify-center rounded-full"
                                        >
                                            {/* Same vocabulary as TaskCheckbox: an empty ring until it's done. */}
                                            <span className="h-6 w-6 rounded-full border-[1.5px] border-twilight-text-muted/70 transition-colors group-hover:border-accent-primary/50" />
                                        </button>
                                    </Tip>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
