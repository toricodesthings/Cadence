/**
 * Primitive: Popover
 *
 * Pre-themed Radix Popover with Cadence's twilight glass aesthetic.
 * Domain components import from here — never from @radix-ui/react-popover directly.
 */
import * as RadixPopover from "@radix-ui/react-popover";
import { FLOATING_MORPH, FLOATING_SURFACE, morphFrom } from "./menu-styles";

/* ── Re-exports ─────────────────────────────────────────────────── */
export const Root = RadixPopover.Root;
export const Anchor = RadixPopover.Anchor;

export const Trigger = ({ className = "", ...props }: RadixPopover.PopoverTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) => (
    <RadixPopover.Trigger
        className={`cursor-pointer ${className}`}
        {...props}
    />
);

export const Close = ({ className = "", ...props }: RadixPopover.PopoverCloseProps & { ref?: React.Ref<HTMLButtonElement> }) => (
    <RadixPopover.Close
        className={`cursor-pointer ${className}`}
        {...props}
    />
);

/* ── Content ────────────────────────────────────────────────────── */
export const Content = ({ className = "", sideOffset = 8, onWheel, onTouchMove, fromRadius, style, ...props }: RadixPopover.PopoverContentProps & { fromRadius?: string; ref?: React.Ref<HTMLDivElement> }) => (
    <RadixPopover.Portal>
        <RadixPopover.Content
            sideOffset={sideOffset}
            style={morphFrom(fromRadius, sideOffset, style)}
            data-cadence-popover-content="true"
            // A modal Dialog's scroll lock cancels wheel/touchmove at `document`
            // for anything outside it; this content is portaled out, so stop
            // those events here or its scrollable lists can't scroll.
            onWheel={(e) => { e.stopPropagation(); onWheel?.(e); }}
            onTouchMove={(e) => { e.stopPropagation(); onTouchMove?.(e); }}
            className={[
                FLOATING_SURFACE,
                "glass-edge relative rounded-2xl p-4 shadow-2xl",
                FLOATING_MORPH,
                className,
            ].join(" ")}
            {...props}
        />
    </RadixPopover.Portal>
);
