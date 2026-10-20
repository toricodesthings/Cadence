import { useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { MAX_ROUTINE_STEPS, type Habit, type HabitLog, type RoutineStep, type StepStatus } from "@cadence/contracts/habit";
import { stepMarksOn } from "@cadence/domain/repeats";
import { useResolveHabit } from "../../hooks/habits/use-resolve-habit";
import { SortableSubtaskList } from "../tasks/SortableSubtaskList";
import { EditableSubtaskRow } from "../tasks/SubtaskList";

/** "2/3" once some steps are settled (done or skipped) but not all; null otherwise. */
export function stepProgress(habit: Pick<Habit, "steps">, log?: HabitLog): string | null {
    const ids = (habit.steps ?? []).map((step) => step.id);
    const settled = Object.keys(stepMarksOn(ids, log)).length;
    return settled > 0 && settled < ids.length ? `${settled}/${ids.length}` : null;
}

/**
 * A routine's steps, in order: drag to reorder, Enter adds the next one. Built
 * on the subtask rows. `onChange` gets null once the last step is removed.
 */
export function RoutineStepsEditor({ steps, onChange }: { steps: RoutineStep[]; onChange: (steps: RoutineStep[] | null) => void }) {
    const [draft, setDraft] = useState("");
    const set = (next: RoutineStep[]) => onChange(next.length ? next : null);
    const add = () => {
        const title = draft.trim();
        if (!title) return;
        set([...steps, { id: crypto.randomUUID(), title }]);
        setDraft("");
    };

    return (
        <div>
            <SortableSubtaskList
                subtasks={steps.map((step, orderIndex) => ({ ...step, orderIndex }))}
                onReorder={({ optimisticSubtasks }) => set(optimisticSubtasks.map(({ id, title }) => ({ id, title })))}
                renderItem={(props) => (
                    <EditableSubtaskRow
                        {...props}
                        deleteLabel={`Remove step ${props.subtask.title}`}
                        leading={<span aria-hidden="true" className="w-5 shrink-0 text-center text-xs tabular-nums text-twilight-text-muted">{props.subtask.orderIndex + 1}</span>}
                        onDelete={(id) => set(steps.filter((step) => step.id !== id))}
                        onTitleChange={(id, title) => set(steps.map((step) => (step.id === id ? { ...step, title } : step)))}
                    />
                )}
            />
            {steps.length < MAX_ROUTINE_STEPS ? (
                <input
                    type="text"
                    value={draft}
                    maxLength={200}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        event.stopPropagation();
                        add();
                    }}
                    onBlur={add}
                    aria-label="New step"
                    placeholder={steps.length ? "Add the next step…" : "Add a step…"}
                    className={`min-h-11 w-full bg-transparent ${steps.length ? "pl-[3.25rem]" : ""} text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted/80`}
                />
            ) : <p className="py-2 pl-[3.25rem] text-xs text-twilight-text-muted">{MAX_ROUTINE_STEPS} steps at most.</p>}
        </div>
    );
}

/**
 * One day's steps to tick or skip one by one. The day is done once every step
 * is done or skipped; a partly done day just waits, it's never "incomplete".
 */
export function RoutineStepChecklist({ habit, date, log }: {
    habit: Pick<Habit, "id" | "steps">;
    date: string;
    log?: HabitLog;
}) {
    const { mutate: resolve } = useResolveHabit(habit.id);
    const steps = habit.steps ?? [];
    const marks = stepMarksOn(steps.map((step) => step.id), log);
    const mark = (id: string, next: StepStatus[string]) => {
        const updated = { ...marks };
        if (updated[id] === next) delete updated[id];
        else updated[id] = next;
        resolve({ targetDate: date, status: "PENDING", stepStatus: updated });
    };

    return (
        <RoutineCheckList
            label="Steps"
            items={steps.map((step) => ({ id: step.id, name: step.title, title: step.title, state: marks[step.id] }))}
            onMark={mark}
        />
    );
}

type CheckMark = "COMPLETED" | "SKIPPED";

/**
 * A day's steps or times as soft rows under a segmented progress track: the
 * whole row checks it off (tap again to clear), Skip sits quietly at the end.
 * Rows take the routine's tone from `--routine-tone`.
 */
export function RoutineCheckList({ label, items, onMark }: {
    label: string;
    items: { id: string; name: string; title: ReactNode; note?: string; state?: CheckMark }[];
    onMark: (id: string, next: CheckMark) => void;
}) {
    return (
        <div>
            <div aria-hidden="true" className="flex gap-1 px-2.5 pb-2 pt-1">
                {items.map((item) => (
                    <span
                        key={item.id}
                        className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                            item.state === "COMPLETED"
                                ? "bg-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_80%,transparent)]"
                                : item.state === "SKIPPED" ? "bg-twilight-border/60" : "bg-white/[0.08]"
                        }`}
                    />
                ))}
            </div>
            <ul aria-label={label} className="flex flex-col gap-0.5">
                {items.map((item) => {
                    const done = item.state === "COMPLETED";
                    const skipped = item.state === "SKIPPED";
                    return (
                        <li
                            key={item.id}
                            className={`group flex items-center rounded-2xl transition-colors ${done ? "bg-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_12%,transparent)]" : "hover:bg-white/[0.04]"}`}
                        >
                            <button
                                type="button"
                                onClick={() => onMark(item.id, "COMPLETED")}
                                aria-pressed={done}
                                aria-label={`${item.name}: done`}
                                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl pl-2.5 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--routine-tone,var(--color-moonlit))]"
                            >
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${
                                    done
                                        ? "bg-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_80%,transparent)] text-[var(--primary-foreground)]"
                                        : skipped
                                            ? "border border-dashed border-twilight-border/70 text-twilight-text-muted"
                                            : "border-[1.5px] border-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_45%,transparent)] group-hover:border-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_80%,transparent)]"
                                }`}>
                                    {done ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : skipped ? <X size={11} aria-hidden="true" /> : null}
                                </span>
                                <span className={`min-w-0 flex-1 truncate text-sm ${done || skipped ? "text-twilight-text-muted" : "text-twilight-text"}`}>{item.title}</span>
                                {item.note ? <span className="shrink-0 text-xs tabular-nums text-twilight-text-muted">{item.note}</span> : null}
                            </button>
                            <button
                                type="button"
                                onClick={() => onMark(item.id, "SKIPPED")}
                                aria-pressed={skipped}
                                aria-label={skipped ? `${item.name}: skipped` : `Skip ${item.name}`}
                                className={`min-h-11 shrink-0 cursor-pointer rounded-2xl px-3 text-xs font-medium text-twilight-text-muted transition-[color,opacity] hover:text-twilight-text focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${skipped ? "text-twilight-text-soft" : "opacity-60 group-hover:opacity-100"}`}
                            >
                                {skipped ? "Skipped" : "Skip"}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
