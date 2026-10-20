import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_ROUTINE_TIMES, type Habit, type HabitLog } from "@cadence/contracts/habit";
import { timeMarksOn } from "@cadence/domain/repeats";
import { atLocal } from "@cadence/domain/time";
import { TimePicker } from "../primitives/TimePicker";
import { timeAction, useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import { formatTime, formatWallTime } from "../../lib/utils/date-format";
import { getUserZone, today } from "../../lib/utils/user-zone";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { RoutineCheckList } from "./RoutineSteps";

/** "8:00 AM, 2:00 PM and 8:00 PM" in the user's time format. */
export function listTimes(times: readonly string[]): string {
    const labels = times.map(formatWallTime);
    return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : (labels[0] ?? "");
}

/** The next time a row starts at: four hours after the last, else the first free half hour. */
export function nextTime(times: readonly string[]): string {
    const last = times.at(-1);
    const hour = last ? Number(last.slice(0, 2)) + 4 : 9;
    if (hour < 24) {
        const candidate = `${String(hour).padStart(2, "0")}:${last?.slice(3) ?? "00"}`;
        if (!times.includes(candidate)) return candidate;
    }
    return Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`).find((t) => !times.includes(t)) ?? "12:00";
}

/**
 * A routine's daily times, one row each, with Add time. Sorted on every change;
 * a time already in the list is ignored. Emits at least one time (the composer and
 * editor decide what fewer means).
 */
export function RoutineTimes({ times, onChange, cadence = "Every day" }: {
    times: readonly string[];
    onChange: (times: string[]) => void;
    /** Leads the live summary, e.g. "Every day". */
    cadence?: string;
}) {
    const set = (next: string[]) => onChange([...new Set(next)].sort());
    return (
        <div className="space-y-2" role="group" aria-label="Times">
            {times.map((time, index) => (
                <div key={index} className="flex items-center gap-2">
                    <TimePicker label={`Time ${index + 1}`} value={time} onChange={(next) => next && set(times.map((t) => (t === time ? next : t)))} className="min-w-0 flex-1" />
                    {times.length > 1 ? (
                        <button
                            type="button"
                            aria-label={`Remove ${formatWallTime(time)}`}
                            onClick={() => set(times.filter((t) => t !== time))}
                            className="touch-target flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <X size={15} aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            ))}
            {times.length < MAX_ROUTINE_TIMES ? (
                <button
                    type="button"
                    onClick={() => set([...times, nextTime(times)])}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-[13px] font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    <Plus size={14} aria-hidden="true" />
                    Add time
                </button>
            ) : null}
            {times.length > 1 ? (
                <p className="text-xs text-twilight-text-muted">{cadence} at {listTimes(times)}. Check off each time separately.</p>
            ) : null}
        </div>
    );
}

/**
 * One day's times to check off one by one: each row says exactly what it records
 * ("Done at 2:07 PM"), Skip and Undo touch just that time, and a later time is
 * never completed by an earlier tap. Mirrors the step checklist.
 */
export function RoutineTimeChecklist({ habit, date, log }: {
    habit: Pick<Habit, "id" | "title" | "times">;
    date: string;
    log?: HabitLog;
}) {
    const { mutate: resolve } = useResolveHabit(habit.id);
    const { isTouch } = useShellMode();
    const times = habit.times ?? [];
    const marks = timeMarksOn(times, log);
    const mark = (time: string, next: "COMPLETED" | "SKIPPED") => {
        const previous = marks[time];
        const clearing = previous?.status === next;
        // A past day's check-in happened at that day's time, not now.
        const action = timeAction(time, clearing ? "PENDING" : next, date < today() ? atLocal(date, time, getUserZone()) : undefined);
        resolve({ targetDate: date, ...action });
        // The mark shows in place; only touch, where a stray tap is likely, gets an Undo toast (as the day cells do).
        if (!isTouch) return;
        toast.message(clearing ? "Cleared" : next === "COMPLETED" ? `Done at ${formatTime(action.at)}` : "Skipped", {
            description: `${habit.title} · ${formatWallTime(time)}`,
            action: { label: "Undo", onClick: () => resolve({ targetDate: date, ...timeAction(time, previous?.status ?? "PENDING", previous?.at ?? undefined) }) },
        });
    };

    return (
        <RoutineCheckList
            label="Times"
            items={times.map((time) => {
                const state = marks[time];
                const note = state?.status !== "COMPLETED" ? undefined : state.at ? `Done at ${formatTime(state.at)}` : "Done";
                return { id: time, name: formatWallTime(time), title: <span className="tabular-nums">{formatWallTime(time)}</span>, note, state: state?.status };
            })}
            onMark={mark}
        />
    );
}
