import { CHIP_ACTIVE, CHIP_BASE, CHIP_IDLE } from "../tasks/task-choice-options";
import type { RepeatKind } from "../../hooks/habits/use-convert-repeat";

const OPTIONS: Array<{ kind: RepeatKind; label: string; hint: string }> = [
    { kind: "task", label: "Still owed", hint: "Carries over" },
    { kind: "routine", label: "Let it go", hint: "Routine" },
    { kind: "fixed", label: "It just passes", hint: "Fixed" },
];

/**
 * "If you miss one…" — the one question that tells Fixed, Routine and Task
 * apart. Shared by the task and routine editors.
 */
export function RepeatKindPicker({
    value,
    onChange,
    disabled,
    fixedUnavailableReason,
}: {
    value: RepeatKind;
    onChange: (kind: RepeatKind) => void;
    disabled?: boolean;
    /** Set when this item can't be Fixed yet (e.g. it has no time). */
    fixedUnavailableReason?: string | null;
}) {
    return (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="If you miss one">
            <span className="text-[13px] text-twilight-text-muted">If you miss one…</span>
            <div className="grid grid-cols-3 gap-1.5">
                {OPTIONS.map((option) => {
                    const active = option.kind === value;
                    const unavailable = option.kind === "fixed" && !active && Boolean(fixedUnavailableReason);
                    return (
                        <button
                            key={option.kind}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={disabled || unavailable}
                            onClick={() => { if (!active) onChange(option.kind); }}
                            className={`${CHIP_BASE} min-h-12 flex-col gap-0 disabled:cursor-not-allowed disabled:opacity-50 ${active ? CHIP_ACTIVE : CHIP_IDLE}`}
                        >
                            <span>{option.label}</span>
                            <span className="text-[10px] font-normal opacity-80">{option.hint}</span>
                        </button>
                    );
                })}
            </div>
            {fixedUnavailableReason && value !== "fixed" ? (
                <p className="text-xs text-twilight-text-muted">{fixedUnavailableReason}</p>
            ) : null}
        </div>
    );
}
