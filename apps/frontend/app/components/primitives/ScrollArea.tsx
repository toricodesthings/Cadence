/**
 * Primitive: ScrollArea
 *
 * Pre-themed Radix ScrollArea with Cadence's thin translucent scrollbar.
 * Domain components import from here — never from @radix-ui/react-scroll-area directly.
 */
import * as RadixScrollArea from "@radix-ui/react-scroll-area";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = ({ className = "", ...props }: RadixScrollArea.ScrollAreaProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Root
        data-slot="scroll-area-root"
        className={`min-h-0 ${className}`}
        {...props}
    />
);

/* ── Viewport ───────────────────────────────────────────────────── */
export const Viewport = ({ className = "", ...props }: RadixScrollArea.ScrollAreaViewportProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Viewport
        data-slot="scroll-area-viewport"
        // Radix wraps content in `display: table`, which grows to fit its widest row
        // and defeats `truncate`. Every Cadence scroll area is vertical, so block it.
        className={`h-full min-h-0 [&>div]:block! ${className}`}
        {...props}
    />
);

/* ── Scrollbar ──────────────────────────────────────────────────── */
export const Scrollbar = ({ className = "", orientation = "vertical", ...props }: RadixScrollArea.ScrollAreaScrollbarProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Scrollbar
        orientation={orientation}
        className={`w-1 p-px ${className}`}
        {...props}
    />
);

/* ── Thumb ───────────────────────────────────────────────────────── */
export const Thumb = ({ className = "", ...props }: RadixScrollArea.ScrollAreaThumbProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixScrollArea.Thumb
        className={`rounded-full bg-white/8 ${className}`}
        {...props}
    />
);
