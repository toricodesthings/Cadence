import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { Tip } from "../../primitives";
import { ArrowRight, Calendar, Check, LoaderCircle, MessageSquareText, Moon, Pencil, Sparkles, Sun, Sunrise, Trash2, X } from "lucide-react";
import { addDays, type LocalDate } from "@cadence/domain/time";
import type { ResetDisposition } from "@cadence/contracts/planning";
import type { useWeekRoom } from "../../../hooks/core/use-week-room";
import { formatWeekdayLong, formatWeekdayShort } from "../../../lib/utils/date-format";
import { Reveal } from "../../shared/Reveal";
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
    /** The decision model's pick: shown as the primary with a small mark, never applied without the tap. */
    guess?: boolean;
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

/**
 * The row's title, renamed in place: hovering shows a pencil, a click turns it into a field with Save and Cancel.
 * Enter saves, Escape cancels; leaving the field keeps the draft open (nothing is lost or saved by accident).
 */
function RenamableTitle({ title, onRename }: { title: string; onRename?: (title: string) => void }) {
    const [draft, setDraft] = useState<string | null>(null);
    const text = "truncate text-[0.9375rem] font-medium text-twilight-text";
    if (!onRename) return <span className={text}>{title}</span>;
    if (draft === null) {
        return (
            <button type="button" onClick={() => setDraft(title)} aria-label={`Rename ${title}`}
                className="group/title -mx-1.5 flex min-w-0 max-w-fit cursor-text items-center gap-2 rounded-lg px-1.5 py-0.5 text-left transition-colors hover:bg-accent-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50">
                <span className={text}>{title}</span>
                <Pencil size={14} aria-hidden="true" className="shrink-0 text-twilight-text-muted opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-visible/title:opacity-100 [@media(hover:none)]:opacity-60" />
            </button>
        );
    }
    const next = draft.trim();
    const save = () => {
        if (next && next !== title) onRename(next);
        setDraft(null);
    };
    return (
        <form className="flex min-w-0 items-center gap-1" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setDraft(null); } }}
                onFocus={(e) => e.currentTarget.select()}
                maxLength={500}
                aria-label="New name"
                className="surface-control min-h-9 min-w-0 flex-1 rounded-lg px-2.5 text-[0.9375rem] font-medium text-twilight-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            />
            <Tip label="Save" side="top">
                <button type="submit" disabled={!next} aria-label="Save name" className="glass-none touch-target inline-flex cursor-pointer items-center justify-center rounded-lg px-2 text-accent-primary hover:bg-accent-primary/10 disabled:opacity-40">
                    <Check size={17} aria-hidden="true" />
                </button>
            </Tip>
            <Tip label="Cancel" side="top">
                <button type="button" onClick={() => setDraft(null)} aria-label="Cancel rename" className="glass-none touch-target inline-flex cursor-pointer items-center justify-center rounded-lg px-2 text-twilight-text-soft hover:bg-accent-primary/5 hover:text-twilight-text">
                    <X size={17} aria-hidden="true" />
                </button>
            </Tip>
        </form>
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
    chip,
    onRename,
}: {
    title: string;
    /** Rename in place (the title becomes a field). */
    onRename?: (title: string) => Promise<void>;
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
    /** A quiet chip under the title (a capture's suggested list). */
    chip?: ReactNode;
}) {
    const [typing, setTyping] = useState(false);
    const [stepsOpen, setStepsOpen] = useState(false);
    const quiet = "glass-none touch-target inline-flex cursor-pointer items-center justify-center rounded-xl px-2.5 text-twilight-text-soft transition-colors hover:bg-accent-primary/5 hover:text-twilight-text disabled:opacity-40";
    return (
        <div className="surface-row flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl px-4 py-3">
            <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
                {select ? (
                    <input
                        type="checkbox"
                        checked={select.checked}
                        onChange={select.onChange}
                        aria-label={`Pick ${title}`}
                        className="size-5 shrink-0 cursor-pointer accent-[var(--accent-primary)]"
                    />
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <RenamableTitle title={title} onRename={onRename && ((next) => onRunAction(`${actionKeyPrefix}:rename`, () => onRename(next)))} />
                    {chip}
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
                {actions.map((act, i) => {
                    const key = `${actionKeyPrefix}:${i}`;
                    const isPending = pendingActionKey === key;
                    const isDanger = act.variant === "danger";
                    const isPrimary = act.variant === "cardPrimary";
                    const Icon = act.icon;
                    // The primary carries its label so the likely choice reads in under 2s; the rest are icons with a Tip.
                    const button = (
                        <button
                            type="button"
                            disabled={Boolean(pendingActionKey)}
                            onClick={() => onRunAction(key, async () => { await act.onClick(); })}
                            aria-label={act.guess ? `${act.label} (my guess from your week)` : act.label}
                            className={isPrimary
                                ? "surface-control-accent touch-target inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium text-accent-primary disabled:opacity-40"
                                : `${quiet} ${isDanger ? "text-feedback-error hover:bg-feedback-error/10 hover:text-feedback-error" : ""}`}
                        >
                            {isPending ? (
                                <LoaderCircle size={15} className="sync-spin" aria-hidden="true" />
                            ) : (
                                <Icon size={isPrimary ? 15 : 17} aria-hidden="true" />
                            )}
                            {isPrimary && !isPending && <span>{act.shortLabel ?? act.label}</span>}
                            {act.guess && !isPending ? <Sparkles size={12} aria-hidden="true" className="opacity-80" /> : null}
                        </button>
                    );
                    return (
                        <Tip key={i} label={act.guess ? "My guess from your week" : act.label} side="top">
                            {button}
                        </Tip>
                    );
                })}
                {typed ? (
                    <Tip label="Say it instead" side="top">
                        <button
                            type="button"
                            onClick={() => setTyping((open) => !open)}
                            aria-label="Say it instead"
                            aria-expanded={typing}
                            className={quiet}
                        >
                            <MessageSquareText size={17} aria-hidden="true" />
                        </button>
                    </Tip>
                ) : null}
            </div>
            <Reveal open={typing && !!typed} className="w-full">
                {typed ? (
                    <InstructionField
                        autoFocus
                        placeholder={typed.placeholder}
                        applyLabel={typed.applyLabel}
                        listId={typed.listId}
                        disabled={Boolean(pendingActionKey)}
                        onApply={async (patch) => { await typed.onApply(patch); setTyping(false); }}
                    />
                ) : null}
            </Reveal>
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
                <span role="alert" className="w-full text-xs text-feedback-error">{actionError}</span>
            )}
        </div>
    );
}

export type ReviewActions = ReturnType<typeof useWeeklyReviewActions>;

export type StepProps = { review: ReviewActions };

export type DayChoice = { day: LocalDate } | { later: true };
type DayFor = ReturnType<typeof useWeekRoom>["dayFor"];

/**
 * A row's day choices, in one fixed order: the primary (the day its words name, else the model's guess, else Today),
 * then Today · Tomorrow · Later, then Trash. A guess only moves into the primary slot; nothing else moves or goes.
 */
export function dayActions({ words, guess, dayFor, minutes, place, trash }: {
    words?: ReviewAction | null;
    guess?: ResetDisposition;
    dayFor: DayFor;
    minutes?: number | null;
    place: (choice: DayChoice) => Promise<void>;
    trash: () => Promise<void>;
}): ReviewAction[] {
    const today = dayFor("today", minutes);
    const tomorrow = addDays(today, 1);
    const todayAct: ReviewAction = { label: "Today", icon: Sun, onClick: () => place({ day: today }) };
    const tomorrowAct: ReviewAction = { label: "Tomorrow", icon: Sunrise, onClick: () => place({ day: tomorrow }) };
    const laterAct: ReviewAction = { label: "Later", icon: Moon, onClick: () => place({ later: true }) };
    const base = [todayAct, tomorrowAct, laterAct];
    const guessed = (): ReviewAction | null => {
        if (guess === "today") return todayAct;
        if (guess === "later") return laterAct;
        if (guess === "next_week") return { label: "Next week", icon: ArrowRight, onClick: () => place({ day: dayFor("next_week", minutes) }) };
        if (guess !== "this_week") return null;
        const day = dayFor("this_week", minutes);
        if (day === tomorrow) return tomorrowAct;
        if (day === today) return todayAct;
        return { label: formatWeekdayLong(day), shortLabel: formatWeekdayShort(day), icon: Calendar, onClick: () => place({ day }) };
    };
    const fromGuess = words ? null : guessed();
    const primary = words ?? fromGuess ?? todayAct;
    return [
        { ...primary, variant: "cardPrimary", guess: !!fromGuess },
        ...base.filter((a) => a !== primary),
        { label: "Move to Trash", shortLabel: "Trash", icon: Trash2, onClick: trash, variant: "danger" },
    ];
}
