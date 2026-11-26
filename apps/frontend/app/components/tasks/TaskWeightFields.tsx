import {
    CHIP_ACTIVE,
    CHIP_BASE,
    CHIP_IDLE,
    EFFORT_ICON,
    EFFORT_OPTIONS,
    FIELD_LABEL,
    PRIORITY_ICON,
    PRIORITY_OPTIONS,
} from "./task-choice-options";
import type { ComposerEffort } from "../../hooks/tasks/use-composer-effort";
import { X } from "lucide-react";
import type { EffortLevel, TaskPriority } from "@cadence/contracts/task";
import type { EffortSuggestion } from "@cadence/nlp/effort";
import { effortName, suggestionLabel, suggestionLevels } from "@cadence/domain/effort-evidence";

export function PriorityField({ value, onChange }: { value: TaskPriority; onChange: (value: TaskPriority) => void }) {
    return (
        <div role="group" aria-label="Priority">
            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                <PRIORITY_ICON size={12} aria-hidden="true" />
                Priority
            </span>
            <div className="grid grid-cols-5 gap-1.5">
                {PRIORITY_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            aria-label={`Priority: ${item.label}`}
                            aria-pressed={value === item.value}
                            onClick={() => onChange(item.value)}
                            className={`${CHIP_BASE} min-h-12 flex-col gap-0.5 sm:min-h-10 sm:flex-row sm:gap-1.5 ${value === item.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                        >
                            <Icon size={14} aria-hidden="true" />
                            <span className="text-[10px] leading-none sm:text-xs sm:leading-normal">{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function EffortField({ value, onChange }: { value: EffortLevel; onChange: (value: EffortLevel) => void }) {
    return (
        <div role="group" aria-label="Effort">
            <span className={`mb-2 flex items-center gap-1.5 ${FIELD_LABEL}`}>
                <EFFORT_ICON size={12} aria-hidden="true" />
                Effort
            </span>
            <div className="grid grid-cols-3 gap-1.5">
                {EFFORT_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <button
                            key={item.value}
                            type="button"
                            aria-pressed={value === item.value}
                            onClick={() => onChange(value === item.value ? null : item.value)}
                            className={`${CHIP_BASE} ${value === item.value ? CHIP_ACTIVE : CHIP_IDLE}`}
                        >
                            <Icon size={13} aria-hidden="true" />
                            {item.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function EffortSuggestionRow({
    suggestion,
    onUse,
    onDismiss,
    guess,
}: {
    suggestion: EffortSuggestion;
    onUse: (level: 1 | 2 | 3) => void;
    onDismiss: () => void;
    guess?: { why?: string };
}) {
    return (
        <div
            role="group"
            aria-label="Suggested effort"
            className="flex flex-wrap items-center gap-1.5 text-[11px] text-twilight-text-soft"
        >
            <EFFORT_ICON size={12} aria-hidden="true" />
            {guess ? (
                <span>
                    <span className="sr-only">Effort guess: </span>
                    <span aria-hidden="true">~</span>
                    {suggestionLabel(suggestion)}
                </span>
            ) : (
                <span>Suggested effort: {suggestionLabel(suggestion)}</span>
            )}
            {suggestionLevels(suggestion).map((level) => (
                <button
                    key={level}
                    type="button"
                    onClick={() => onUse(level)}
                    aria-label={`Use ${effortName(level)} effort`}
                    className={`${CHIP_BASE} ${CHIP_IDLE} min-h-8 px-2.5 text-[11px]`}
                >
                    Use {effortName(level)}
                </button>
            ))}
            <button
                type="button"
                onClick={onDismiss}
                aria-label="Dismiss suggested effort"
                className="flex size-8 cursor-pointer items-center justify-center rounded-full opacity-70 hover:opacity-100"
            >
                <X size={11} aria-hidden="true" />
            </button>
            <details className="w-full">
                <summary className="min-h-6 cursor-pointer text-twilight-text-muted">Why?</summary>
                <p className="pt-1 text-twilight-text-muted">
                    {guess?.why ??
                        `From the Effort you chose on ${suggestion.support} similar task${suggestion.support === 1 ? "" : "s"}.`}
                </p>
            </details>
        </div>
    );
}

export function AcceptedEffort({ level, onUndo }: { level: 1 | 2 | 3; onUndo: () => void }) {
    return (
        <div role="status" className="flex items-center gap-1.5 text-[11px] text-twilight-text-soft">
            <EFFORT_ICON size={12} aria-hidden="true" />
            <span>Effort: {effortName(level)}</span>
            <button
                type="button"
                onClick={onUndo}
                aria-label={`Undo ${effortName(level)} effort`}
                className="flex size-8 cursor-pointer items-center justify-center rounded-full opacity-70 hover:opacity-100"
            >
                <X size={11} aria-hidden="true" />
            </button>
        </div>
    );
}

export function ComposerEffortRow({ choice }: { choice: ComposerEffort }) {
    if (choice.effort && choice.accepted) return <AcceptedEffort level={choice.effort} onUndo={choice.undoAccept} />;
    if (choice.suggestion)
        return <EffortSuggestionRow suggestion={choice.suggestion} onUse={choice.accept} onDismiss={choice.dismiss} />;
    return null;
}
