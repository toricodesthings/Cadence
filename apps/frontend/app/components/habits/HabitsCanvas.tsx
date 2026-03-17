import { toISODate } from "../../lib/utils/date-format";
import type { Habit } from "../../types/habit";
import { HabitItem } from "./HabitItem";
import { HabitMenu } from "./HabitMenu";
import { HabitDayPlaceholder } from "./HabitDayPlaceholder";
import { Flame } from "lucide-react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";

interface HabitsCanvasProps {
    weekDates: Date[];
    habits: Habit[];
    selectedHabitId?: string | null;
    onSelectHabit?: (id: string) => void;
    emptyStateMode?: "active" | "archived";
}

export function HabitsCanvas({ weekDates, habits, selectedHabitId, onSelectHabit, emptyStateMode = "active" }: HabitsCanvasProps) {
    const shell = useShellMode();
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
            {shell.isPhone ? (
                <>
                    <div className="grid grid-cols-7 gap-2 border-b border-twilight-border/30 pb-3">
                        {days.map((day) => {
                            const isToday = today === day.iso;
                            return (
                                <div key={day.iso} className="flex flex-col items-center gap-1">
                                    <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isToday ? "text-lantern" : "text-twilight-text-soft"}`}>
                                        {day.label.slice(0, 2)}
                                    </span>
                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium ${isToday ? "bg-lantern text-twilight-void" : "text-twilight-text"}`}>
                                        {day.dayNum}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                        {habits.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
                                    <Flame size={24} className="text-lantern" />
                                </div>
                                <h3 className="mb-2 text-lg font-medium text-twilight-text">
                                    {emptyStateMode === "archived" ? "No archived habits." : "The sanctuary is ready."}
                                </h3>
                                <p className="max-w-sm text-sm text-twilight-text-muted">
                                    {emptyStateMode === "archived"
                                        ? "Keep up the consistent work across your active routines."
                                        : "Add a routine above, then return here to log it throughout the week."}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {habits.map((habit) => {
                                    const isSelected = habit.id === selectedHabitId;
                                    const logsByDate = habitLogMap.get(habit.id) ?? new Map();

                                    return (
                                        <section
                                            key={habit.id}
                                            className={`rounded-[1.5rem] border px-4 py-4 transition-colors ${
                                                isSelected
                                                    ? "border-lantern/25 bg-lantern/[0.06]"
                                                    : "border-twilight-border/35 bg-white/[0.03]"
                                            }`}
                                        >
                                            <div className="mb-3 flex items-start gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectHabit?.(habit.id)}
                                                    className="min-w-0 flex-1 text-left"
                                                >
                                                    <h3 className="truncate text-[15px] font-medium text-twilight-text">
                                                        {habit.title}
                                                    </h3>
                                                    <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-twilight-text-soft">
                                                        <Flame size={11} className="text-lantern shrink-0" />
                                                        {habit.currentStreak}d streak
                                                    </p>
                                                </button>
                                                <HabitMenu habit={habit} />
                                            </div>

                                            <div className="grid grid-cols-7 gap-2">
                                                {days.map((day) => {
                                                    const logForDay = logsByDate.get(day.iso);
                                                    if (!logForDay) {
                                                        return <HabitDayPlaceholder key={day.iso} habit={habit} targetDate={day.iso} />;
                                                    }

                                                    return (
                                                        <HabitItem
                                                            key={day.iso}
                                                            habit={habit}
                                                            targetDate={day.iso}
                                                            log={logForDay}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
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

                    <div className="mt-1 min-h-0 flex-1 overflow-auto pr-1 scrollbar-thin">
                        {habits.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center px-4 py-20 text-center">
                                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-twilight-surface ring-1 ring-twilight-border">
                                    <Flame size={24} className="text-lantern" />
                                </div>
                                <h3 className="mb-2 text-lg font-medium text-twilight-text">
                                    {emptyStateMode === "archived" ? "No archived habits." : "The sanctuary is ready."}
                                </h3>
                                <p className="max-w-sm text-sm text-twilight-text-muted">
                                    {emptyStateMode === "archived"
                                        ? "Keep up the consistent work across your active routines."
                                        : "Add a routine above, then return here to log it throughout the week."}
                                </p>
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
                                                className={`group -mx-1 flex items-center rounded-xl px-1 py-3 transition-colors ${
                                                    isSelected ? "bg-lantern/[0.05]" : "hover:bg-white/[0.02]"
                                                }`}
                                            >
                                                <div className="flex w-36 shrink-0 items-center gap-1 pr-1 sm:w-44">
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectHabit?.(habit.id)}
                                                        className="flex min-w-0 flex-1 items-start gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lantern/40"
                                                        aria-label={`View details for ${habit.title}`}
                                                        aria-pressed={isSelected}
                                                    >
                                                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full shadow-[0_0_6px_rgba(232,164,74,0.5)] transition-colors ${isSelected ? "bg-lantern" : "bg-lantern/60 group-hover:bg-lantern"}`} />
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className={`truncate text-[13px] font-medium leading-tight transition-colors ${
                                                                isSelected
                                                                    ? "text-twilight-text"
                                                                    : "text-twilight-text-soft group-hover:text-twilight-text"
                                                            }`}>
                                                                {habit.title}
                                                            </h3>
                                                            {habit.currentStreak > 0 && (
                                                                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-twilight-text-soft">
                                                                    <Flame size={10} className="shrink-0 text-lantern" />
                                                                    {habit.currentStreak}d streak
                                                                </p>
                                                            )}
                                                        </div>
                                                    </button>
                                                    <HabitMenu habit={habit} />
                                                </div>

                                                <div className="ml-1 grid flex-1 grid-cols-7">
                                                    {days.map((day) => {
                                                        const logForDay = logsByDate.get(day.iso);

                                                        if (!logForDay) {
                                                            return (
                                                                <div key={day.iso} className="flex h-12 items-center justify-center">
                                                                    <HabitDayPlaceholder habit={habit} targetDate={day.iso} />
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
                </>
            )}
        </div>
    );
}
