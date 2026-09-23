/**
 * Primitive: Popover
 *
 * Pre-themed Radix Popover with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-popover directly.
 */
import * as RadixPopover from "@radix-ui/react-popover";
import { forwardRef } from "react";
import { FLOATING_MOTION, FLOATING_SURFACE } from "./menu-styles";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixPopover.Root;
export const Anchor = RadixPopover.Anchor;

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
>(({ className = "", sideOffset = 8, onWheel, onTouchMove, ...props }, ref) => (
    <RadixPopover.Portal>
        <RadixPopover.Content
            ref={ref}
            sideOffset={sideOffset}
            data-cadence-popover-content="true"
            // A modal Dialog's scroll lock cancels wheel/touchmove at `document`
            // for anything outside it; this content is portaled out, so stop
            // those events here or its scrollable lists can't scroll.
            onWheel={(e) => { e.stopPropagation(); onWheel?.(e); }}
            onTouchMove={(e) => { e.stopPropagation(); onTouchMove?.(e); }}
            className={[
                FLOATING_SURFACE,
                "rounded-2xl p-4 shadow-2xl",
                FLOATING_MOTION,
                className,
            ].join(" ")}
            {...props}
        />
    </RadixPopover.Portal>
));
Content.displayName = "Popover.Content";
