import type { CSSProperties } from "react";
import { AnimatePresence } from "framer-motion";
import { Check, Pause, Flame, Pencil } from "lucide-react";
import type { HabitReviewItem } from "../../../hooks/core/use-weekly-review-actions";
import { useSettings } from "../../../hooks/core/use-settings";
import { useToday } from "../../../lib/utils/user-zone";
import { routineTone } from "../../../lib/utils/habits";
import { formatWeekdayNarrow } from "../../../lib/utils/date-format";
import { RoutineDayCell } from "../../habits/RoutineDayCell";
import { ResolvingRow, StepEmpty, StepShell } from "../StepShell";
import type { ReviewActions } from "./shared";

/**
 * The last seven days as the app's own day cells: tap to check a day off (or un-check it), right-click or
 * long-press for Skip and Clear. A day it wasn't due is a dot; an earlier day left open stays quiet, never a miss.
 */
function RoutineWeek({ item, today, bloom }: { item: HabitReviewItem; today: string; bloom: boolean }) {
    const logs = new Map((item.habit.logs ?? []).map((l) => [l.targetDate, l]));
    return (
        <div role="group" aria-label={`${item.title}, last 7 days`} className="grid w-full grid-cols-7 gap-1 @3xl:w-auto @3xl:grid-cols-[repeat(7,2.75rem)] @3xl:gap-1.5">
            {item.week.map(({ day }) => (
                <div key={day} className="flex flex-col items-center gap-1.5">
                    <span aria-hidden="true" className={`text-[0.6875rem] font-medium uppercase tracking-[0.04em] ${day === today ? "text-[var(--routine-tone)]" : "text-twilight-text-muted"}`}>
                        {formatWeekdayNarrow(day)}
                    </span>
                    <RoutineDayCell size="fit" habit={item.habit} date={day} log={logs.get(day)} today={today} bloom={bloom} openRing />
                </div>
            ))}
        </div>
    );
}

function HabitReviewCard({ item, today, bloom, onKeep, onPause, onEdit }: {
    item: HabitReviewItem;
    today: string;
    bloom: boolean;
    onKeep: () => void;
    onPause: () => void;
    onEdit: () => void;
}) {
    const quiet = "glass-none touch-target inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-accent-primary/5 hover:text-twilight-text";
    return (
        <article
            aria-label={item.title}
            className="surface-card flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[1.25rem] px-4 py-4 @3xl:flex-nowrap @3xl:py-3"
            style={{ "--routine-tone": routineTone(item.colorAccent) } as CSSProperties}
        >
            <div className="flex min-w-0 flex-1 basis-full items-center gap-3 @3xl:basis-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--routine-tone)_14%,transparent)] text-[var(--routine-tone)]">
                    <Flame size={18} aria-hidden="true" />
                </span>
                <h3 className="min-w-0 truncate text-base font-medium tracking-[-0.005em] text-twilight-text">{item.title}</h3>
            </div>
            <RoutineWeek item={item} today={today} bloom={bloom} />
            <div className="flex w-full items-center gap-1 @3xl:w-auto">
                <button type="button" onClick={onKeep} className="surface-control-accent touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-sm font-medium text-accent-primary">
                    <Check size={15} aria-hidden="true" /> Keep
                </button>
                {item.allSkipped ? (
                    <button type="button" onClick={onPause} className="surface-control touch-target inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-twilight-text">
                        <Pause size={15} aria-hidden="true" /> Skip next week?
                    </button>
                ) : (
                    <button type="button" onClick={onPause} className={quiet}><Pause size={15} aria-hidden="true" /> Pause</button>
                )}
                <button type="button" onClick={onEdit} className={`${quiet} ml-auto @3xl:ml-0`}><Pencil size={15} aria-hidden="true" /> Edit</button>
            </div>
        </article>
    );
}

/* ─── Step 3 · Routines ─── */
export function HabitsStep({ habits, anyHabits, pauseHabit, onReviewed, onEdit, onTitleVisible }: {
    habits: HabitReviewItem[];
    anyHabits: boolean;
    pauseHabit: ReviewActions["pauseHabit"];
    onReviewed: (id: string) => void;
    /** Opens the routine's panel beside the list; the card stays until Keep or Pause. */
    onEdit: (id: string) => void;
    onTitleVisible?: (visible: boolean) => void;
}) {
    const today = useToday();
    const { data: settings } = useSettings();
    const bloom = !settings?.tasks?.intelligence?.lowStimulationMode;
    return (
        <StepShell step={3} count={habits.length} onTitleVisible={onTitleVisible}>
            {habits.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                    <AnimatePresence initial={false}>
                        {habits.map((item) => (
                            <ResolvingRow key={item.id}>
                                <HabitReviewCard
                                    item={item}
                                    today={today}
                                    bloom={bloom}
                                    onKeep={() => onReviewed(item.id)}
                                    onPause={() => { pauseHabit.pause(item.id); onReviewed(item.id); }}
                                    onEdit={() => onEdit(item.id)}
                                />
                            </ResolvingRow>
                        ))}
                    </AnimatePresence>
                </div>
            ) : (
                <StepEmpty icon={Flame} title={anyHabits ? "All good" : "No routines yet"} />
            )}
        </StepShell>
    );
}
