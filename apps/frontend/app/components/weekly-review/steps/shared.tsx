import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "../../primitives/Button";
import { Tip } from "../../primitives";
import { ArrowRight, Check, LoaderCircle, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { useWeeklyReviewActions } from "../../../hooks/core/use-weekly-review-actions";
import { InstructionField } from "../../weekly-review/InstructionField";
import type { InstructionPatch } from "@cadence/domain/task-instruction";
import type { PlanningOffer } from "@cadence/contracts/planning";
import { PlanningOfferChip } from "../../tasks/PlanningOfferChip";
import { InlineSubtaskPanel, useInlineSubtasks } from "../../tasks/InlineSubtasks";
import { useSubtasks } from "../../../hooks/tasks/use-subtasks";

export interface ReviewAction {
    label: string;
    shortLabel?: string;
    icon: LucideIcon;
    onClick: () => Promise<void> | void;
    variant?: string;
}

/** A row's subtask panel, opened by "Break into steps?": the cursor is already in the field (`useInlineSubtasks` takes the ask). */
export function ReviewSteps({ taskId }: { taskId: string }) {
    const { data: subtasks = [] } = useSubtasks(taskId);
    const ui = useInlineSubtasks(taskId);
    return (
        <div className="w-full pl-7">
            <InlineSubtaskPanel taskId={taskId} subtasks={subtasks} open adding={ui.adding} onAddingChange={ui.setAdding} />
        </div>
    );
}

export function ReviewListItem({
    title,
    taskId,
    offer,
    actions,
    pendingActionKey,
    actionKeyPrefix,
    actionError,
    onRunAction,
    select,
    typed,
}: {
    title: string;
    taskId?: string;
    /** The one suggestion on this page, when it is for this row. */
    offer?: { kind: PlanningOffer; onAccept: () => void; onNotNow: () => void } | null;
    actions: ReviewAction[];
    pendingActionKey: string | null;
    actionKeyPrefix: string;
    actionError: string | null;
    onRunAction: (key: string, fn: () => Promise<void>) => void;
    /** Pick this row for one change to several. */
    select?: { checked: boolean; onChange: () => void };
    /** Say a change in words instead of tapping a fixed choice. */
    typed?: { placeholder: string; applyLabel: string; onApply: (patch: InstructionPatch) => Promise<void>; listId?: string | null };
}) {
    const [typing, setTyping] = useState(false);
    const [stepsOpen, setStepsOpen] = useState(false);
    return (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-twilight-border/40 bg-twilight-surface/30 px-4 py-3 transition-colors hover:bg-white/[0.03]">
            {select ? (
                <input
                    type="checkbox"
                    checked={select.checked}
                    onChange={select.onChange}
                    aria-label={`Select ${title}`}
                    className="size-5 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
                />
            ) : null}
            <span className="w-full sm:w-auto sm:flex-1 min-w-0 truncate text-sm font-medium text-twilight-text">
                {title}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
                {actions.map((act, i) => {
                    const key = `${actionKeyPrefix}:${i}`;
                    const isPending = pendingActionKey === key;
                    const isDanger = act.variant === "danger";
                    const isPrimary = act.variant === "cardPrimary";
                    const Icon = act.icon;
                    // Primary action carries its label so the dominant choice is
                    // obvious in <2s (§6.3); the rest demote to icon-only with a
                    // stylized Tip + aria-label (§6.6) to keep the row scannable.
                    const button = (
                        <button
                            type="button"
                            disabled={Boolean(pendingActionKey)}
                            onClick={() => onRunAction(key, async () => { await act.onClick(); })}
                            aria-label={act.label}
                            className={`touch-target inline-flex items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-40 ${
                                isPrimary ? "px-3.5" : "px-2.5"
                            } ${
                                isDanger
                                    ? "text-feedback-error hover:bg-feedback-error/10"
                                    : isPrimary
                                        ? "bg-accent-primary/14 text-accent-primary hover:bg-accent-primary/20"
                                        : "text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                            }`}
                        >
                            {isPending ? (
                                <LoaderCircle size={15} className="sync-spin" aria-hidden="true" />
                            ) : (
                                <Icon size={isPrimary ? 14 : 16} aria-hidden="true" />
                            )}
                            {isPrimary && !isPending && <span>{act.shortLabel ?? act.label}</span>}
                        </button>
                    );
                    return (
                        <Tip key={i} label={act.label} side="top">
                            {button}
                        </Tip>
                    );
                })}
            </div>
            {typed ? (
                <Tip label="Type a change" side="top">
                    <button
                        type="button"
                        onClick={() => setTyping((open) => !open)}
                        aria-label="Type a change"
                        aria-expanded={typing}
                        className="touch-target inline-flex items-center justify-center rounded-xl px-2.5 text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                    >
                        <Pencil size={16} aria-hidden="true" />
                    </button>
                </Tip>
            ) : null}
            {typing && typed ? (
                <InstructionField
                    autoFocus
                    placeholder={typed.placeholder}
                    applyLabel={typed.applyLabel}
                    listId={typed.listId}
                    disabled={Boolean(pendingActionKey)}
                    onApply={async (patch) => { await typed.onApply(patch); setTyping(false); }}
                />
            ) : null}
            {offer ? (
                <div className="w-full">
                    <PlanningOfferChip
                        kind={offer.kind}
                        onAccept={() => { if (offer.kind === "steps") setStepsOpen(true); offer.onAccept(); }}
                        onNotNow={offer.onNotNow}
                    />
                </div>
            ) : null}
            {stepsOpen && taskId ? <ReviewSteps taskId={taskId} /> : null}
            {actionError && (
                <span className="text-xs text-feedback-error">{actionError}</span>
            )}
        </div>
    );
}


/* ──────── Step empty state ──────── */

export function StepDone({ label, onNext }: { label: string; onNext: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center text-center py-12">
            <div className="w-14 h-14 rounded-full bg-accent-primary/10 flex items-center justify-center mb-4">
                <Check size={24} className="text-accent-primary" />
            </div>
            <p className="text-sm text-twilight-text-soft mb-6">{label}</p>
            <Button variant="primary" size="md" onClick={onNext}>
                Continue <ArrowRight size={16} />
            </Button>
        </div>
    );
}

/* ──────────────────────────── Page ──────────────────────────── */

export function StepPanel({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass max-w-xl mx-auto w-full rounded-3xl p-4 sm:p-6"
        >
            <div className="mb-6">
                <h2 className="text-lg font-display font-semibold text-twilight-text">{title}</h2>
                <p className="text-sm text-twilight-text-soft mt-1">{intro}</p>
            </div>
            {children}
        </motion.div>
    );
}

export function SkipToNext({ onSkip }: { onSkip: () => void }) {
    return (
        <div className="mt-6 flex justify-end">
            <Button variant="ghost" size="sm" onClick={onSkip}>
                Skip to next step <ArrowRight size={14} />
            </Button>
        </div>
    );
}

export type ReviewActions = ReturnType<typeof useWeeklyReviewActions>;

export type StepProps = { review: ReviewActions; onNext: () => void };
