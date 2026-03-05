import { toISODate } from "../../lib/utils/date-format";
import type { Habit } from "../../types/habit";
import { HabitItem } from "./HabitItem";
import { HabitMenu } from "./HabitMenu";
import { Flame } from "lucide-react";

interface HabitsCanvasProps {
    weekDates: Date[];
    habits: Habit[];
    selectedHabitId?: string | null;
    onSelectHabit?: (id: string) => void;
    emptyStateMode?: "active" | "archived";
}

export function HabitsCanvas({ weekDates, habits, selectedHabitId, onSelectHabit, emptyStateMode = "active" }: HabitsCanvasProps) {
    const today = toISODate(new Date());
    const days = weekDates.map((d) => ({
        date: d,
        iso: toISODate(d),
        label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d),
        dayNum: d.getDate(),
    }));

    return (
        <div className="flex-1 min-h-0 px-6 pb-6 overflow-hidden flex flex-col">
            {/* Column headers */}
            <div className="flex border-b border-twilight-border/40 pb-3 mt-2">
                {/* Habit name column spacer */}
                <div className="w-52 shrink-0" />
                {/* Day columns */}
                <div className="flex-1 grid grid-cols-7">
                    {days.map((day, i) => {
                        const isToday = today === day.iso;
                        return (
                            <div key={i} className="flex flex-col items-center gap-0.5">
                                <span className={`text-[10px] font-semibold uppercase tracking-widest transition-colors ${isToday ? "text-lantern" : "text-twilight-text-muted/60"}`}>
                                    {day.label}
                                </span>
                                <span className={`text-[13px] font-medium transition-all w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-lantern text-twilight-void font-bold text-xs shadow-[0_0_8px_rgba(232,164,74,0.4)]" : "text-twilight-text-soft"}`}>
                                    {day.dayNum}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Habit rows */}
            <div className="flex-1 overflow-y-auto mt-1 pr-1 scrollbar-none">
                {habits.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-twilight-text-muted">
                        <div className="w-12 h-12 rounded-2xl bg-lantern/10 flex items-center justify-center">
                            <Flame size={22} className="text-lantern/60" />
                        </div>
                        {emptyStateMode === "archived" ? (
                            <>
                                <p className="font-light tracking-wide text-base text-twilight-text-soft">No archived habits</p>
                                <p className="text-[11px] uppercase tracking-widest text-twilight-text-muted/50">Keep up the good work!</p>
                            </>
                        ) : (
                            <>
                                <p className="font-light tracking-wide text-base text-twilight-text-soft">The sanctuary awaits your routines</p>
                                <p className="text-[11px] uppercase tracking-widest text-twilight-text-muted/50">Add your first habit above ↑</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col divide-y divide-twilight-border/20">
                        {habits.map((habit) => {
                            const isSelected = habit.id === selectedHabitId;
                            return (
                                <div
                                    key={habit.id}
                                    className={`group flex items-center py-3 transition-colors rounded-xl px-1 -mx-1 ${isSelected
                                        ? "bg-lantern/[0.05]"
                                        : "hover:bg-white/[0.02]"
                                        }`}
                                >
                                    {/* Habit info column — clickable to open detail panel */}
                                    <button
                                        type="button"
                                        onClick={() => onSelectHabit?.(habit.id)}
                                        className="w-52 shrink-0 flex items-center gap-2.5 pr-3 min-w-0 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lantern/40 rounded-lg"
                                        aria-label={`View details for ${habit.title}`}
                                        aria-pressed={isSelected}
                                    >
                                        {/* Color dot */}
                                        <span className={`w-2 h-2 rounded-full shrink-0 shadow-[0_0_6px_rgba(232,164,74,0.5)] transition-colors ${isSelected ? "bg-lantern" : "bg-lantern/60 group-hover:bg-lantern"}`} />
                                        <div className="min-w-0 flex-1">
                                            <h3 className={`text-[13px] font-medium truncate leading-tight transition-colors ${isSelected
                                                ? "text-twilight-text"
                                                : "text-twilight-text-soft group-hover:text-twilight-text"
                                                }`}>
                                                {habit.title}
                                            </h3>
                                            {habit.currentStreak > 0 && (
                                                <p className="text-[10px] text-twilight-text-muted/60 mt-0.5 flex items-center gap-1">
                                                    <Flame size={9} className="text-lantern/60 shrink-0" />
                                                    {habit.currentStreak}d streak
                                                </p>
                                            )}
                                        </div>
                                    </button>

                                    {/* Menu — separate from the clickable area */}
                                    <HabitMenu habit={habit} />

                                    {/* Day checkboxes */}
                                    <div className="flex-1 grid grid-cols-7 ml-1">
                                        {days.map((day) => {
                                            const logForDay = habit.logs?.find(
                                                (l) => l.targetDate.substring(0, 10) === day.iso
                                            );

                                            if (!logForDay) {
                                                return (
                                                    <div key={day.iso} className="flex items-center justify-center h-11">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-twilight-border/30" />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={day.iso} className="h-11 flex items-center justify-center">
                                                    <HabitItem
                                                        habit={habit}
                                                        targetDate={day.iso}
                                                        log={logForDay}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
