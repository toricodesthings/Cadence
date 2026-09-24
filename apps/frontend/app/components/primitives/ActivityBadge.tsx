import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/** Decorative navigation indicator; the owning control supplies its accessible label. */
export function ActivityBadge({ count, className }: { count?: ReactNode; className?: string }) {
    if (count === 0) return null;
    return (
        <span
            aria-hidden="true"
            className={cn(
                "activity-badge pointer-events-none inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold tabular-nums",
                count === undefined ? "size-2" : "min-h-4 min-w-4 px-1 text-[10px] leading-4",
                className,
            )}
        >
            {count}
        </span>
    );
}
