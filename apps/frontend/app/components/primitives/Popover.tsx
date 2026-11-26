import * as RadixPopover from "@radix-ui/react-popover";
import { FLOATING_MORPH, FLOATING_SURFACE, morphFrom } from "./menu-styles";

export const Root = RadixPopover.Root;
export const Anchor = RadixPopover.Anchor;

export const Trigger = ({
    className = "",
    ...props
}: RadixPopover.PopoverTriggerProps & { ref?: React.Ref<HTMLButtonElement> }) => (
    <RadixPopover.Trigger data-morph-trigger className={`cursor-pointer ${className}`} {...props} />
);

export const Close = ({
    className = "",
    ...props
}: RadixPopover.PopoverCloseProps & { ref?: React.Ref<HTMLButtonElement> }) => (
    <RadixPopover.Close className={`cursor-pointer ${className}`} {...props} />
);

export const Content = ({
    className = "",
    sideOffset = 8,
    onWheel,
    onTouchMove,
    fromRadius,
    style,
    ...props
}: RadixPopover.PopoverContentProps & { fromRadius?: string; ref?: React.Ref<HTMLDivElement> }) => (
    <RadixPopover.Portal>
        <RadixPopover.Content
            sideOffset={sideOffset}
            style={morphFrom(fromRadius, sideOffset, style)}
            data-cadence-popover-content="true"
            onWheel={(e) => {
                e.stopPropagation();
                onWheel?.(e);
            }}
            onTouchMove={(e) => {
                e.stopPropagation();
                onTouchMove?.(e);
            }}
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
