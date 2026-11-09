import { Check, Sun, Sunrise, Moon, Trash2 } from "lucide-react";

import { InstructionField } from "../../weekly-review/InstructionField";
import { MAX_BATCH } from "../../../hooks/tasks/use-apply-instruction";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { Task } from "@cadence/contracts/task";
import { usePlanningOffers } from "../../../hooks/ai/use-planning-offers";
import { type ReviewAction, type ReviewActions, ReviewListItem, SkipToNext, StepDone, StepPanel, type StepProps } from "./shared";


/** One change typed for the rows the user picked: shows what changes and how many, applies on one press. */
export function BatchBar({ count, onApply, onClear }: { count: number; onApply: (patch: InstructionPatch) => Promise<void>; onClear: () => void }) {
    return (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-col gap-2 rounded-2xl border border-accent-primary/25 bg-twilight-deep/90 p-3 backdrop-blur-xl" role="region" aria-label="Change selected tasks">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-twilight-text">{count} selected{count > MAX_BATCH ? ` (${MAX_BATCH} at a time)` : ""}</span>
                <button type="button" onClick={onClear} className="touch-target min-h-9 cursor-pointer rounded-lg px-2 text-xs text-twilight-text-soft hover:text-twilight-text">Clear</button>
            </div>
            <InstructionField
                placeholder="move these to next Monday, put these in Work…"
                applyLabel={`Apply to ${Math.min(count, MAX_BATCH)} task${count === 1 ? "" : "s"}`}
                onApply={onApply}
            />
        </div>
    );
}

/** What every stabilize row shares: the page's one suggestion, batch picking, and typed changes. */
export type RowsState = {
    offers: ReturnType<typeof usePlanningOffers>;
    selectedIds: Set<string>;
    toggleSelected: (id: string) => void;
    applyToOne: (task: Task, patch: InstructionPatch) => Promise<void>;
};

export type WorkSectionProps = {
    label: string;
    tasks: Task[];
    kind: "unscheduled" | "waiting";
    placeholder: string;
    listClass: string;
    actionsFor: (task: Task) => ReviewAction[];
    rows: RowsState;
    review: ReviewActions;
};

export function WorkSection({ label, tasks, kind, placeholder, listClass, actionsFor, rows, review }: WorkSectionProps) {
    const { offers } = rows;
    if (tasks.length === 0) return null;
    return (
        <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted">{label}</p>
            <div className={listClass}>
                {tasks.map((task) => (
                    <ReviewListItem
                        key={task.id}
                        title={task.title}
                        taskId={task.id}
                        offer={offers.task?.id === task.id && offers.kind ? { kind: offers.kind, onAccept: offers.accept, onNotNow: offers.notNow } : null}
                        actionKeyPrefix={`${kind}:${task.id}`}
                        select={{ checked: rows.selectedIds.has(task.id), onChange: () => rows.toggleSelected(task.id) }}
                        typed={{ placeholder, applyLabel: "Apply", onApply: (patch) => rows.applyToOne(task, patch), listId: task.projectId }}
                        actions={actionsFor(task)}
                        pendingActionKey={review.pendingActionKey}
                        actionError={review.actionError}
                        onRunAction={review.runCardAction}
                    />
                ))}
            </div>
        </>
    );
}

export type StabilizeStepProps = StepProps & {
    rows: RowsState;
    selectedTasks: Task[];
    onApplySelected: (patch: InstructionPatch) => Promise<void>;
    onClearSelected: () => void;
};

/* ─── Step 2 · Stabilize (unscheduled + waiting) ─── */
export function StabilizeStep({ review, rows, selectedTasks, onApplySelected, onClearSelected, onNext }: StabilizeStepProps) {
    const { unscheduledTasks, visibleWaiting, handleUnscheduledAction, handleWaitingAction } = review;
    const count = unscheduledTasks.length + visibleWaiting.length;
    return (
        <StepPanel title="Work to stabilize" intro={count > 0
                ? `${count} item${count > 1 ? "s" : ""} need a home or a decision.`
                : "Everything is placed and accounted for."}>
            <WorkSection
                label="Unscheduled"
                tasks={unscheduledTasks}
                kind="unscheduled"
                placeholder="Friday afternoon for 30 min, in Work, waiting on Alex…"
                listClass="flex flex-col gap-2 mb-5"
                rows={rows}
                review={review}
                actionsFor={(task) => [
                    { label: "Assign Today", shortLabel: "Today", icon: Sun, onClick: () => handleUnscheduledAction(task, "today"), variant: "cardPrimary" },
                    { label: "Assign Tomorrow", shortLabel: "Tomorrow", icon: Sunrise, onClick: () => handleUnscheduledAction(task, "tomorrow") },
                    { label: "Move to Waitlist", shortLabel: "Later", icon: Moon, onClick: () => handleUnscheduledAction(task, "someday") },
                    { label: "Move to Trash", shortLabel: "Trash", icon: Trash2, onClick: () => handleUnscheduledAction(task, "delete"), variant: "cardDanger" },
                ]}
            />
            <WorkSection
                label="Waiting on a decision"
                tasks={visibleWaiting}
                kind="waiting"
                placeholder="follow up next Tuesday, keep waiting until Monday, activate tomorrow…"
                listClass="flex flex-col gap-2"
                rows={rows}
                review={review}
                actionsFor={(task) => [
                    { label: "Activate Today", shortLabel: "Today", icon: Sun, onClick: () => handleWaitingAction(task, "today"), variant: "cardPrimary" },
                    { label: "Activate Tomorrow", shortLabel: "Tomorrow", icon: Sunrise, onClick: () => handleWaitingAction(task, "tomorrow") },
                    { label: "Keep Waiting", shortLabel: "Keep", icon: Check, onClick: () => { review.setKeptWaitingIds((prev) => new Set(prev).add(task.id)); } },
                    { label: "Move to Trash", shortLabel: "Trash", icon: Trash2, onClick: () => handleWaitingAction(task, "delete"), variant: "cardDanger" },
                ]}
            />
            {count === 0 && (
                <StepDone label="Everything is placed." onNext={onNext} />
            )}
            {selectedTasks.length > 0 && (
                <BatchBar count={selectedTasks.length} onApply={onApplySelected} onClear={onClearSelected} />
            )}
            {count > 0 && <SkipToNext onSkip={onNext} />}
        </StepPanel>
    );
}
