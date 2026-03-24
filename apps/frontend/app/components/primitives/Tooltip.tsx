/**
 * Primitive: Tooltip
 *
 * Pre-themed Radix Tooltip with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-tooltip directly.
 */
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { forwardRef } from "react";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Provider = RadixTooltip.Provider;
export const Root = RadixTooltip.Root;
export const Trigger = RadixTooltip.Trigger;
export const Portal = RadixTooltip.Portal;
export const Arrow = RadixTooltip.Arrow;

/* ── Content ────────────────────────────────────────────────────── */
export const Content = forwardRef<
    HTMLDivElement,
    RadixTooltip.TooltipContentProps
>(({ className = "", sideOffset = 10, ...props }, ref) => (
    <RadixTooltip.Content
        ref={ref}
        sideOffset={sideOffset}
        className={[
            "glass-surface layer-floating-ui rounded-lg px-3 py-1.5 text-xs text-twilight-text",
            "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
            "data-[state=delayed-open]:fade-in data-[state=closed]:fade-out",
            "data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "duration-200",
            className,
        ].join(" ")}
        {...props}
    />
));
Content.displayName = "Tooltip.Content";
