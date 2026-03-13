import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import type { Habit } from "../../types/habit";

interface HabitDayPlaceholderProps {
    habit: Habit;
    targetDate: string;
}

/** Clickable placeholder dot for days without a log entry — lets the user resolve the habit. */
export function HabitDayPlaceholder({ habit, targetDate }: HabitDayPlaceholderProps) {
    const { mutate: resolveHabit } = useResolveHabit(habit.id);

    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                resolveHabit({ targetDate, status: "COMPLETED" });
            }}
            aria-label={`Mark ${habit.title} complete on ${targetDate}`}
            className="touch-target flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 hover:bg-twilight-surface-hover hover:border hover:border-twilight-border-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lantern focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-void cursor-pointer"
        >
            <div className="w-1.5 h-1.5 rounded-full bg-twilight-border/30 transition-colors group-hover:bg-twilight-text-muted" />
        </button>
    );
}
