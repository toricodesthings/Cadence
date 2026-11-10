import { AnimatePresence } from "framer-motion";
import { CalendarX, ListTodo, Sun, Sunrise, Trash2, UserCheck, X, EyeOff, type LucideIcon } from "lucide-react";
import type { ResetDisposition } from "@cadence/contracts/planning";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { Task } from "@cadence/contracts/task";
import { InstructionField } from "../../weekly-review/InstructionField";
import { MAX_BATCH } from "../../../hooks/tasks/use-apply-instruction";
import { usePlanningOffers } from "../../../hooks/ai/use-planning-offers";
import type { useWeekRoom } from "../../../hooks/core/use-week-room";
import { ResolvingRow, StepEmpty, StepShell } from "../StepShell";
import { dayActions, ReviewListItem, type ReviewAction, type ReviewActions } from "./shared";

/** One change typed for the rows the user picked; it docks in the footer in place of Back/Next. */
export function BatchBar({ count, onApply, onClear }: { count: number; onApply: (patch: InstructionPatch) => Promise<void>; onClear: () => void }) {
    return (
        <div className="flex w-full flex-col gap-2" role="region" aria-label="Change picked tasks">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium tabular-nums text-twilight-text">{count} picked{count > MAX_BATCH ? ` (${MAX_BATCH} at a time)` : ""}</span>
                <button type="button" onClick={onClear} className="touch-target inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-twilight-text-soft hover:text-twilight-text">
                    <X size={14} aria-hidden="true" /> Clear
                </button>
            </div>
            <InstructionField
                placeholder={"Like “next Mon” or “in Work”"}
                applyLabel={`Change ${Math.min(count, MAX_BATCH)}`}
                onApply={onApply}
            />
        </div>
    );
}

/** What every loose-end row shares: the page's one suggestion, picking for a batch, typed changes and the model's guesses. */
export type RowsState = {
    offers: ReturnType<typeof usePlanningOffers>;
    selectedIds: Set<string>;
    toggleSelected: (id: string) => void;
    applyToOne: (task: Task, patch: InstructionPatch) => Promise<void>;
    guesses: Record<string, ResetDisposition>;
    dayFor: ReturnType<typeof useWeekRoom>["dayFor"];
};

function WorkSection({ icon: Icon, label, tasks, kind, placeholder, actionsFor, rows, review }: {
    icon: LucideIcon;
    label: string;
    tasks: Task[];
    kind: "unscheduled" | "waiting";
    placeholder: string;
    actionsFor: (task: Task) => ReviewAction[];
    rows: RowsState;
    review: ReviewActions;
}) {
    const { offers } = rows;
    if (tasks.length === 0) return null;
    return (
        <section aria-label={label} className="flex min-w-0 flex-col gap-2">
            <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-twilight-text-soft">
                <Icon size={16} aria-hidden="true" className="text-accent-primary" /> {label}
                <span className="tabular-nums text-twilight-text-muted">{tasks.length}</span>
            </h2>
            <AnimatePresence initial={false}>
                {tasks.map((task) => (
                    <ResolvingRow key={task.id}>
                        <ReviewListItem
                            title={task.title}
                            onRename={(title) => review.renameTask(task, title)}
                            taskId={task.id}
                            offer={offers.task?.id === task.id && offers.kind ? { kind: offers.kind, onAccept: offers.accept, onNotNow: offers.notNow } : null}
                            actionKeyPrefix={`${kind}:${task.id}`}
                            select={{ checked: rows.selectedIds.has(task.id), onChange: () => rows.toggleSelected(task.id) }}
                            typed={{ placeholder, applyLabel: "Change", onApply: (patch) => rows.applyToOne(task, patch), listId: task.projectId }}
                            actions={actionsFor(task)}
                            pendingActionKey={review.pendingActionKey}
                            actionError={review.actionError}
                            onRunAction={review.runCardAction}
                        />
                    </ResolvingRow>
                ))}
            </AnimatePresence>
        </section>
    );
}

/** A waiting row: Today (activate) by default, or Still waiting when that's the model's guess. */
function waitingActions(task: Task, review: ReviewActions, rows: RowsState): ReviewAction[] {
    const guess = rows.guesses[task.id];
    const activate: ReviewAction = { label: "Today", icon: Sun, onClick: () => review.handleWaitingAction(task, "today") };
    const keep: ReviewAction = { label: "Still waiting", icon: UserCheck, onClick: () => review.handleWaitingAction(task, "keep") };
    const primary = guess === "keep_waiting" ? keep : activate;
    return [
        { ...primary, variant: "cardPrimary", guess: guess === "keep_waiting" || guess === "activate" },
        ...(primary === keep ? [activate] : []),
        { label: "Tomorrow", icon: Sunrise, onClick: () => review.handleWaitingAction(task, "tomorrow") },
        ...(primary === keep ? [] : [keep]),
        { label: "Move to Trash", shortLabel: "Trash", icon: Trash2, onClick: () => review.handleWaitingAction(task, "delete"), variant: "danger" },
    ];
}

/* ─── Step 2 · Loose ends (no day yet + waiting) ─── */
export function StabilizeStep({ review, rows, onTitleVisible }: { review: ReviewActions; rows: RowsState; onTitleVisible?: (visible: boolean) => void }) {
    const { unscheduledTasks, visibleWaiting, handleUnscheduledAction } = review;
    const count = unscheduledTasks.length + visibleWaiting.length;
    const { slipping, hideSlipping } = rows.offers;
    return (
        <StepShell step={2} count={count} onTitleVisible={onTitleVisible}>
            {slipping.length > 0 ? (
                <div className="surface-card mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3" role="note">
                    <EyeOff size={18} aria-hidden="true" className="text-accent-primary" />
                    <span className="flex-1 text-[0.9375rem] text-twilight-text">These keep slipping. Hide till next week?</span>
                    <button type="button" onClick={hideSlipping} className="surface-control-accent touch-target inline-flex cursor-pointer items-center rounded-xl px-3.5 text-sm font-medium text-accent-primary">
                        Hide them
                    </button>
                </div>
            ) : null}
            {count > 0 ? (
                <div className="grid items-start gap-6 @5xl:grid-cols-2">
                    <WorkSection
                        icon={CalendarX}
                        label="No day yet"
                        tasks={unscheduledTasks}
                        kind="unscheduled"
                        placeholder={"Say when, like “Fri 3pm”"}
                        rows={rows}
                        review={review}
                        actionsFor={(task) => dayActions({
                            guess: rows.guesses[task.id],
                            dayFor: rows.dayFor,
                            minutes: task.durationEstimate,
                            place: (choice) => ("later" in choice ? handleUnscheduledAction(task, "someday") : handleUnscheduledAction(task, "day", choice.day)),
                            trash: () => handleUnscheduledAction(task, "delete"),
                        })}
                    />
                    <WorkSection
                        icon={UserCheck}
                        label="Waiting"
                        tasks={visibleWaiting}
                        kind="waiting"
                        placeholder={"Like “check back Tue”"}
                        rows={rows}
                        review={review}
                        actionsFor={(task) => waitingActions(task, review, rows)}
                    />
                </div>
            ) : (
                <StepEmpty icon={ListTodo} title="All set" />
            )}
        </StepShell>
    );
}
