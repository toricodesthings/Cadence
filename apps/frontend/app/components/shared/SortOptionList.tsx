import type { SortMode } from "../../lib/utils/task/sort-tasks";

export const SORT_MODE_OPTIONS: Array<{ value: SortMode; label: string }> = [
    { value: "smart", label: "Smart order" },
    { value: "priority", label: "Priority" },
    { value: "manual", label: "Manual" },
];

/** The sort choice as touch rows — shared by every compact controls popover. */
export function SortOptionList({ mode, onModeChange }: { mode: SortMode; onModeChange: (mode: SortMode) => void }) {
    return (
        <div className="space-y-2">
            {SORT_MODE_OPTIONS.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onModeChange(option.value)}
                    aria-pressed={mode === option.value}
                    className={`touch-target flex min-h-11 w-full items-center justify-between rounded-2xl border px-4 text-sm font-medium ${
                        mode === option.value
                            ? "border-accent-primary/30 bg-accent-primary/14 text-accent-primary"
                            : "border-twilight-border/40 bg-white/[0.03] text-twilight-text-soft"
                    }`}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
