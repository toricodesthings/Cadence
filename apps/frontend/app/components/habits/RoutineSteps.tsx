import { useState } from "react";
import { Check } from "lucide-react";
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
        <ul aria-label="Steps" className="flex flex-col">
            {steps.map((step) => {
                const state = marks[step.id];
                return (
                    <li key={step.id} className="flex min-h-11 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => mark(step.id, "COMPLETED")}
                            aria-pressed={state === "COMPLETED"}
                            aria-label={`${step.title}: done`}
                            className="touch-target flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--routine-tone,var(--color-moonlit))]"
                        >
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] transition-colors ${
                                state === "COMPLETED"
                                    ? "border-transparent bg-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_80%,transparent)] text-[var(--primary-foreground)]"
                                    : state === "SKIPPED"
                                        ? "border-twilight-border/45"
                                        : "border-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_45%,transparent)] hover:border-[color-mix(in_srgb,var(--routine-tone,var(--color-moonlit))_75%,transparent)]"
                            }`}>
                                {state === "COMPLETED" ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : null}
                            </span>
                        </button>
                        <span className={`min-w-0 flex-1 truncate text-sm ${state === "COMPLETED" ? "text-twilight-text-muted line-through decoration-twilight-text-muted/60" : state === "SKIPPED" ? "text-twilight-text-muted" : "text-twilight-text"}`}>
                            {step.title}
                        </span>
                        <button
                            type="button"
                            onClick={() => mark(step.id, "SKIPPED")}
                            aria-pressed={state === "SKIPPED"}
                            aria-label={state === "SKIPPED" ? `${step.title}: skipped` : `Skip ${step.title}`}
                            className="min-h-9 shrink-0 cursor-pointer rounded-lg px-2.5 text-xs font-medium text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 aria-pressed:bg-white/[0.08] aria-pressed:text-twilight-text-soft"
                        >
                            {state === "SKIPPED" ? "Skipped" : "Skip"}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
