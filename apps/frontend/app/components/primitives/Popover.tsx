/**
 * Primitive: Popover
 *
 * Pre-themed Radix Popover with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-popover directly.
 */
import * as RadixPopover from "@radix-ui/react-popover";
import { forwardRef } from "react";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixPopover.Root;
export const Portal = RadixPopover.Portal;
export const Anchor = RadixPopover.Anchor;
export const Arrow = RadixPopover.Arrow;

export const Trigger = forwardRef<
    HTMLButtonElement,
    RadixPopover.PopoverTriggerProps
>(({ className = "", ...props }, ref) => (
    <RadixPopover.Trigger
        ref={ref}
        className={`cursor-pointer ${className}`}
        {...props}
    />
));
Trigger.displayName = "Popover.Trigger";

export const Close = forwardRef<
    HTMLButtonElement,
    RadixPopover.PopoverCloseProps
>(({ className = "", ...props }, ref) => (
    <RadixPopover.Close
        ref={ref}
        className={`cursor-pointer ${className}`}
        {...props}
    />
));
Close.displayName = "Popover.Close";

/* ── Content ────────────────────────────────────────────────────── */
export const Content = forwardRef<
    HTMLDivElement,
    RadixPopover.PopoverContentProps
>(({ className = "", sideOffset = 8, ...props }, ref) => (
    <RadixPopover.Portal>
        <RadixPopover.Content
            ref={ref}
            sideOffset={sideOffset}
            className={[
                "glass-surface rounded-2xl p-4 z-50 shadow-2xl",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=open]:fade-in data-[state=closed]:fade-out",
                "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95",
                "duration-200",
                className,
            ].join(" ")}
            {...props}
        />
    </RadixPopover.Portal>
));
Content.displayName = "Popover.Content";
