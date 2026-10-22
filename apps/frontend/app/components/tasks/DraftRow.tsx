import { Bell, Calendar, Check, FolderOpen, Repeat, UserCheck, X, Hourglass, Tag } from "lucide-react";
import type { ParsedEntity } from "@cadence/nlp/core";
import { PRIORITY_ICON } from "./task-choice-options";

const ICON: Record<string, React.ReactNode> = {
    scheduled_start: <Calendar size={11} aria-hidden="true" />,
    due_date: <Calendar size={11} aria-hidden="true" />,
    recurrence: <Repeat size={11} aria-hidden="true" />,
    priority: <PRIORITY_ICON size={11} aria-hidden="true" />,
    project: <FolderOpen size={11} aria-hidden="true" />,
    tag: <Tag size={11} aria-hidden="true" />,
    duration: <Hourglass size={11} aria-hidden="true" />,
    waiting_on: <UserCheck size={11} aria-hidden="true" />,
    reminder: <Bell size={11} aria-hidden="true" />,
    not_before: <Calendar size={11} aria-hidden="true" />,
};

/** Each kind's words: the value it reads (its raw phrase when missing), after any lead-in. */
const LABELS: Partial<Record<ParsedEntity["type"], { field: string; prefix?: string }>> = {
    due_date: { field: "humanLabel", prefix: "Deadline " },
    scheduled_start: { field: "humanLabel" },
    recurrence: { field: "humanLabel" },
    project: { field: "name" },
    tag: { field: "name" },
    waiting_on: { field: "person", prefix: "Waiting on " },
    reminder: { field: "humanLabel", prefix: "Remind " },
    not_before: { field: "humanLabel", prefix: "Hidden until " },
};

/** What the entity means, in the words the draft will save (never the raw phrase alone). */
export function entityLabel(e: ParsedEntity): string {
    const v = e.normalizedValue as Record<string, unknown> | undefined;
    if (e.type === "priority") return e.sourceText.toUpperCase();
    if (e.type === "duration") return (v?.humanLabel as string) ?? `${v?.minutes ?? "?"} min`;
    const label = LABELS[e.type];
    if (!label) return e.sourceText;
    return `${label.prefix ?? ""}${(v?.[label.field] as string) ?? e.sourceText}`;
}

interface DraftRowProps {
    /** Applied entities; types in `shownElsewhere` already have their own control. */
    applied: ParsedEntity[];
    suggestions: ParsedEntity[];
    shownElsewhere?: ParsedEntity["type"][];
    literal: boolean;
    onDismiss: (entityId: string) => void;
    onAccept: (entityId: string) => void;
    onLiteral: (literal: boolean) => void;
}

const CHIP = "inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium";
const ACTION = "inline-flex min-h-8 cursor-pointer items-center rounded-full px-2 text-[11px] font-medium text-twilight-text-soft transition-colors hover:text-twilight-text";

/**
 * The quiet row under a parsed field: values that apply with no control of their own (each with its own remove),
 * and the few meanings that need a choice. Nothing here repeats what a field already shows.
 */
export function DraftRow({ applied, suggestions, shownElsewhere = [], literal, onDismiss, onAccept, onLiteral }: DraftRowProps) {
    const values = applied.filter((e) => !shownElsewhere.includes(e.type));
    if (!literal && values.length === 0 && suggestions.length === 0 && applied.length === 0) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Understood from your words">
            {literal ? (
                <button type="button" onClick={() => onLiteral(false)} className={ACTION}>
                    Read my words again
                </button>
            ) : (
                <>
                    {values.map((e) => (
                        <span key={e.id} className={`${CHIP} border-accent-primary/20 bg-accent-primary/10 text-accent-primary`}>
                            {ICON[e.type]}
                            <span>{entityLabel(e)}</span>
                            <button
                                type="button"
                                onClick={() => onDismiss(e.id)}
                                aria-label={`Remove ${entityLabel(e)}, keep "${e.sourceText}" in the title`}
                                className="-mr-1 flex size-6 cursor-pointer items-center justify-center rounded-full opacity-70 hover:opacity-100"
                            >
                                <X size={11} aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                    {suggestions.map((e) => (
                        <span key={e.id} className={`${CHIP} border-twilight-border text-twilight-text-soft`}>
                            {ICON[e.type]}
                            <button type="button" onClick={() => onAccept(e.id)} aria-label={`Use ${entityLabel(e)}`} className="flex cursor-pointer items-center gap-1 hover:text-twilight-text">
                                <Check size={11} aria-hidden="true" />
                                Use {entityLabel(e)}
                            </button>
                            <button
                                type="button"
                                onClick={() => onDismiss(e.id)}
                                aria-label={`Keep "${e.sourceText}" as typed`}
                                className="-mr-1 flex size-6 cursor-pointer items-center justify-center rounded-full opacity-70 hover:opacity-100"
                            >
                                <X size={11} aria-hidden="true" />
                            </button>
                        </span>
                    ))}
                    {applied.length > 0 || suggestions.length > 0 ? (
                        <button type="button" onClick={() => onLiteral(true)} className={ACTION}>
                            Keep as written
                        </button>
                    ) : null}
                </>
            )}
        </div>
    );
}
