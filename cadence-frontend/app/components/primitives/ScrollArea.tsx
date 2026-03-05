/**
 * Primitive: ScrollArea
 *
 * Pre-themed Radix ScrollArea with Cadence's thin translucent scrollbar.
 * Domain components import from here — never from @radix-ui/react-scroll-area directly.
 */
import * as RadixScrollArea from "@radix-ui/react-scroll-area";
import { forwardRef } from "react";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixScrollArea.Root;
export const Corner = RadixScrollArea.Corner;

/* ── Viewport ───────────────────────────────────────────────────── */
export const Viewport = forwardRef<
    HTMLDivElement,
    RadixScrollArea.ScrollAreaViewportProps
>(({ className = "", ...props }, ref) => (
    <RadixScrollArea.Viewport
        ref={ref}
        className={`h-full ${className}`}
        {...props}
    />
));
Viewport.displayName = "ScrollArea.Viewport";

/* ── Scrollbar ──────────────────────────────────────────────────── */
export const Scrollbar = forwardRef<
    HTMLDivElement,
    RadixScrollArea.ScrollAreaScrollbarProps
>(({ className = "", orientation = "vertical", ...props }, ref) => (
    <RadixScrollArea.Scrollbar
        ref={ref}
        orientation={orientation}
        className={`w-1 p-px ${className}`}
        {...props}
    />
));
Scrollbar.displayName = "ScrollArea.Scrollbar";

/* ── Thumb ───────────────────────────────────────────────────────── */
export const Thumb = forwardRef<
    HTMLDivElement,
    RadixScrollArea.ScrollAreaThumbProps
>(({ className = "", ...props }, ref) => (
    <RadixScrollArea.Thumb
        ref={ref}
        className={`rounded-full bg-white/8 ${className}`}
        {...props}
    />
));
Thumb.displayName = "ScrollArea.Thumb";
