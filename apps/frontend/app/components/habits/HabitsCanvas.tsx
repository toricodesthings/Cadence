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
    const habitLogMap = new Map(
        habits.map((habit) => [
            habit.id,
            new Map((habit.logs ?? []).map((log) => [log.targetDate.substring(0, 10), log] as const)),
        ] as const),
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
            {/* Column headers */}
            <div className="mt-2 overflow-x-auto pb-2 scrollbar-thin">
                <div className="min-w-[38rem]">
                    <div className="flex border-b border-twilight-border/40 pb-3">
                        <div className="w-36 shrink-0 sm:w-44" />
                        <div className="grid flex-1 grid-cols-7">
                            {days.map((day, i) => {
                                const isToday = today === day.iso;
                                return (
                                    <div key={i} className="flex min-w-[3.25rem] flex-col items-center gap-1">
                                        <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${isToday ? "text-lantern" : "text-twilight-text-soft"}`}>
                                            {day.label}
                                        </span>
                                        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-medium transition-all ${isToday ? "bg-lantern text-twilight-void font-bold shadow-[0_0_8px_rgba(232,164,74,0.4)]" : "text-twilight-text"}`}>
                                            {day.dayNum}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Habit rows */}
            <div className="mt-1 min-h-0 flex-1 overflow-auto pr-1 scrollbar-thin">
                {habits.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center text-twilight-text-soft">
                        <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-lantern/10">
                            <Flame size={24} className="text-lantern" />
                        </div>
                        {emptyStateMode === "archived" ? (
                            <>
                                <p className="text-lg font-medium tracking-wide text-twilight-text">No archived habits</p>
                                <p className="text-[12px] uppercase tracking-[0.18em] text-twilight-text-soft">Keep up the good work.</p>
                            </>
                        ) : (
                            <>
                                <p className="text-lg font-medium tracking-wide text-twilight-text">The sanctuary is ready for your first routine.</p>
                                <p className="max-w-sm text-sm leading-relaxed text-twilight-text-soft">Add a habit above, then return here to check it off through the week.</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="min-w-[38rem]">
                        <div className="flex flex-col divide-y divide-twilight-border/20">
                        {habits.map((habit) => {
                            const isSelected = habit.id === selectedHabitId;
                            const logsByDate = habitLogMap.get(habit.id) ?? new Map();
                            return (
                                <div
                                    key={habit.id}
                                    className={`group flex items-center py-3 transition-colors rounded-xl px-1 -mx-1 ${isSelected
                                        ? "bg-lantern/[0.05]"
                                        : "hover:bg-white/[0.02]"
                                        }`}
                                >
                                    {/* Habit info column — clickable to open detail panel */}
                                    <div className="flex w-36 shrink-0 items-center gap-1 pr-1 sm:w-44">
                                        <button
                                            type="button"
                                            onClick={() => onSelectHabit?.(habit.id)}
                                            className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lantern/40"
                                            aria-label={`View details for ${habit.title}`}
                                            aria-pressed={isSelected}
                                        >
                                            <span className={`mt-1 h-2 w-2 rounded-full shrink-0 shadow-[0_0_6px_rgba(232,164,74,0.5)] transition-colors ${isSelected ? "bg-lantern" : "bg-lantern/60 group-hover:bg-lantern"}`} />
                                            <div className="min-w-0 flex-1">
                                                <h3 className={`text-[13px] font-medium truncate leading-tight transition-colors ${isSelected
                                                    ? "text-twilight-text"
                                                    : "text-twilight-text-soft group-hover:text-twilight-text"
                                                    }`}>
                                                    {habit.title}
                                                </h3>
                                                {habit.currentStreak > 0 && (
                                                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-twilight-text-soft">
                                                        <Flame size={10} className="text-lantern shrink-0" />
                                                        {habit.currentStreak}d streak
                                                    </p>
                                                )}
                                            </div>
                                        </button>
                                        <HabitMenu habit={habit} />
                                    </div>

                                    {/* Day checkboxes */}
                                    <div className="ml-1 grid flex-1 grid-cols-7">
                                        {days.map((day) => {
                                            const logForDay = logsByDate.get(day.iso);

                                            if (!logForDay) {
                                                return (
                                                    <div key={day.iso} className="flex h-12 items-center justify-center">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-twilight-border/30" />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={day.iso} className="flex h-12 items-center justify-center">
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
                    </div>
                )}
            </div>
        </div>
    );
}
