import { useMemo } from "react";
import { Flag, Clock } from "lucide-react";
import { CalendarTaskChip } from "./CalendarTaskChip";
import { useSwipeNavigation } from "../../hooks/use-swipe-navigation";
import type { Task } from "../../types/task";
import type { HolidayRecord } from "../../lib/holidays/provider";
import type { PersonalEvent } from "../../types/settings";
import { formatTime } from "../../lib/utils/date-format";

interface TimeSlot {
    label: string;
    startMinutes: number;
    tasks: Task[];
}

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
    /** Called when user swipes left (next day) */
    onNavigateNext?: () => void;
    /** Called when user swipes right (previous day) */
    onNavigatePrev?: () => void;
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
    onNavigateNext,
    onNavigatePrev,
}: DayFocusViewProps) {
    const swipeHandlers = useSwipeNavigation({
        onSwipeLeft: () => onNavigateNext?.(),
        onSwipeRight: () => onNavigatePrev?.(),
    });

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

    return (
        <div className="flex flex-col h-full min-h-0 overflow-y-auto px-4 pb-24" {...swipeHandlers}>
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
                            className="inline-flex items-center gap-2 rounded-full border border-personal/20 bg-personal/12 px-3 py-1.5 text-xs font-medium text-personal"
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
                <div className="flex-1 flex items-center justify-center text-twilight-text-muted/60 text-sm">
                    No tasks scheduled
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
                            <Clock size={12} className={isCurrent ? "text-lantern" : "text-twilight-text-muted/60"} />
                            <span className={`text-[12px] font-medium tabular-nums ${isCurrent ? "text-lantern" : "text-twilight-text-muted/80"}`}>
                                {slot.label}
                            </span>
                            {isCurrent && (
                                <span className="text-[10px] text-lantern/70 uppercase tracking-wider font-semibold">Now</span>
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
                                    {onCompleteTask && (
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onCompleteTask(t.id); }}
                                            className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                                        >
                                            <span className="w-2 h-2 rounded-full border border-twilight-text-muted/50" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
