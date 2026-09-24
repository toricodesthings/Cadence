import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

export interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    icon?: ReactNode;
    /** Colour of the chosen segment; defaults to the control's `tone`. */
    tone?: string;
}

const SIZES = {
    sm: { root: "rounded-xl p-0.5", item: "rounded-lg px-3 py-1 text-[13px]" },
    md: { root: "min-h-11 rounded-xl p-0.5", item: "h-9 rounded-lg px-3.5 text-sm" },
} as const;

/**
 * One choice out of a few, shown side by side (Week/Month, Task/Event,
 * Soft/Balanced/Vivid). The chosen segment takes `tone`, the accent by default.
 */
export function SegmentedControl<T extends string>({
    value,
    onChange,
    options,
    ariaLabel,
    size = "md",
    tone = "var(--accent-primary)",
    className,
}: {
    value: T;
    onChange: (value: T) => void;
    options: ReadonlyArray<SegmentedOption<T>>;
    ariaLabel?: string;
    size?: keyof typeof SIZES;
    tone?: string;
    className?: string;
}) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn("inline-flex items-center gap-0.5 border border-twilight-border/30 bg-twilight-base/35", SIZES[size].root, className)}
            style={{ "--segment-tone": tone } as CSSProperties}
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        style={option.tone ? ({ "--segment-tone": option.tone } as CSSProperties) : undefined}
                        className={cn(
                            "inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--segment-tone)]/50",
                            SIZES[size].item,
                            active
                                ? "border-[color-mix(in_srgb,var(--segment-tone)_25%,transparent)] bg-[color-mix(in_srgb,var(--segment-tone)_18%,transparent)] text-[var(--segment-tone)]"
                                : "border-transparent text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text",
                        )}
                    >
                        {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
