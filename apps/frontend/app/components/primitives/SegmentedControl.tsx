import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "../../lib/utils";
import { useLensScrub } from "../../hooks/ui/use-lens-scrub";

export interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    icon?: ReactNode;
    /** Colour of the chosen segment; defaults to the control's `tone`. */
    tone?: string;
}

const SIZES = {
    sm: { root: "rounded-xl p-0.5", item: "rounded-lg px-3 py-1 text-[13px]", lens: "inset-y-0.5 rounded-lg" },
    md: { root: "min-h-11 rounded-xl p-0.5", item: "h-9 rounded-lg px-3.5 text-sm", lens: "top-1/2 h-9 -translate-y-1/2 rounded-lg" },
} as const;

/** The chosen/idle look of one segment, shared with other pressed controls (formatting toggles). Needs `--segment-tone` on the element or an ancestor. */
const SEGMENT_FILL = "border-[color-mix(in_srgb,var(--segment-tone)_25%,transparent)] bg-[color-mix(in_srgb,var(--segment-tone)_18%,transparent)]";
export const SEGMENT_ACTIVE = `${SEGMENT_FILL} text-[var(--segment-tone)]`;
export const SEGMENT_IDLE = "border-transparent text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text";

/**
 * One choice out of a few, shown side by side (Week/Month, Task/Event,
 * Soft/Balanced/Vivid). The chosen segment takes `tone`, the accent by default. Its fill is one
 * lens that glides between segments and, on touch, scrubs under the finger.
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
    const activeIndex = options.findIndex((option) => option.value === value);
    const { trackRef, lens, handlers, hoverIndex } = useLensScrub({ activeIndex, onCommit: (i) => onChange(options[i].value) });
    return (
        <div
            ref={trackRef}
            {...handlers}
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn("surface-control relative inline-flex touch-pan-y items-center gap-0.5 border border-twilight-border/30", SIZES[size].root, className)}
            style={{ "--segment-tone": tone } as CSSProperties}
        >
            <motion.span
                aria-hidden="true"
                className={cn("glass-edge pointer-events-none absolute left-0 border [--edge-strength:0.6]", SEGMENT_FILL, SIZES[size].lens, activeIndex < 0 && "opacity-0")}
                style={{ x: lens.x, width: lens.width, scale: lens.scale, ...(options[activeIndex]?.tone ? { "--segment-tone": options[activeIndex].tone } : {}) }}
            />
            {options.map((option, index) => {
                const active = option.value === value;
                const lit = hoverIndex === null ? active : hoverIndex === index;
                return (
                    <button
                        key={option.value}
                        data-lens-item
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        style={option.tone ? ({ "--segment-tone": option.tone } as CSSProperties) : undefined}
                        className={cn(
                            "relative inline-flex cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-transparent font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--segment-tone)]/50",
                            SIZES[size].item,
                            lit ? "text-[var(--segment-tone)]" : active ? "text-twilight-text-soft" : SEGMENT_IDLE,
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
