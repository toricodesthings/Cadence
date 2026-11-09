import { useNavigate } from "react-router";
import { Check, Pause, Flame, Pencil } from "lucide-react";
import { type ReviewActions, SkipToNext, StepDone, StepPanel } from "./shared";

/* ──────── Habit review row ──────── */

export function HabitReviewRow({
    habit,
    onKeep,
    onPause,
    onOpenInHabits,
}: {
    habit: { id: string; title: string; completedThisWeek: number; skippedThisWeek: number; pendingThisWeek: number; hasTargetTime: boolean };
    onKeep: () => void;
    onPause: () => void;
    onOpenInHabits: () => void;
}) {
    return (
        <div className="rounded-2xl border border-twilight-border/40 bg-twilight-surface/30 px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-secondary/10 text-accent-secondary">
                    <Flame size={14} />
                </div>
                <h4 className="text-sm font-medium text-twilight-text flex-1 truncate">{habit.title}</h4>
            </div>
            <div className="flex items-center gap-4 mb-3 text-xs text-twilight-text-muted">
                <span><span className="text-accent-primary font-semibold">{habit.completedThisWeek}</span> done</span>
                <span><span className="font-semibold">{habit.skippedThisWeek}</span> skipped</span>
                <span><span className="text-accent-secondary font-semibold">{habit.pendingThisWeek}</span> pending</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={onKeep}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-accent-primary/14 px-3 text-xs font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors"
                >
                    <Check size={13} /> Keep
                </button>
                <button
                    type="button"
                    onClick={onPause}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-twilight-text-soft hover:bg-white/[0.06] transition-colors"
                >
                    <Pause size={13} /> Pause
                </button>
                <button
                    type="button"
                    onClick={onOpenInHabits}
                    className="touch-target inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-twilight-text-soft hover:bg-white/[0.06] transition-colors"
                >
                    <Pencil size={13} /> Edit
                </button>
            </div>
        </div>
    );
}

export type HabitsStepProps = {
    habits: ReviewActions["habitReviewItems"];
    anyHabits: boolean;
    pauseHabit: ReviewActions["pauseHabit"];
    onReviewed: (id: string) => void;
    onNext: () => void;
};

/* ─── Step 3 · Habits ─── */
export function HabitsStep({ habits, anyHabits, pauseHabit, onReviewed, onNext }: HabitsStepProps) {
    const navigate = useNavigate();
    return (
        <StepPanel title="Routine check-in" intro={habits.length > 0
                ? `${habits.length} routine${habits.length > 1 ? "s" : ""} to reflect on.`
                : anyHabits
                ? "All routines reviewed."
                : "No routines this week."}>
            {habits.length > 0 ? (
                <div className="flex flex-col gap-3">
                    {habits.map((habit) => (
                        <HabitReviewRow
                            key={habit.id}
                            habit={habit}
                            onKeep={() => onReviewed(habit.id)}
                            onPause={() => {
                                pauseHabit.pause(habit.id);
                                onReviewed(habit.id);
                            }}
                            onOpenInHabits={() => {
                                onReviewed(habit.id);
                                navigate("/routines");
                            }}
                        />
                    ))}
                </div>
            ) : (
                <StepDone
                    label={anyHabits ? "Routines reviewed." : "Visit Routines to start one."}
                    onNext={onNext}
                />
            )}
            {habits.length > 0 && <SkipToNext onSkip={onNext} />}
        </StepPanel>
    );
}
