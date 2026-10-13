import React from "react";
import * as Popover from "../primitives/Popover";
import { Tip } from "../primitives/Tooltip";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { UtilitySheet } from "./UtilitySheet";

/**
 * A picker (day, emoji, colour) that floats beside its trigger, except on a touch phone, where it opens in a
 * sheet like every compact panel: a floating panel inside a sheet is a frame in a frame, and hard to reach.
 */
export function PickerSurface({ trigger, title, open, onOpenChange, tip, flush = false, contentProps, children }: {
    /** One element: the trigger. */
    trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    /** The sheet's heading on a phone. */
    title: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Tooltip for an icon-only trigger (pointer only). */
    tip?: string;
    /** The children own their padding in the sheet. */
    flush?: boolean;
    contentProps?: React.ComponentPropsWithoutRef<typeof Popover.Content>;
    children: React.ReactNode;
}) {
    const { isPhone, isTouch } = useShellMode();
    if (isPhone && isTouch) {
        return (
            <>
                {React.cloneElement(trigger, {
                    "aria-haspopup": "dialog",
                    "aria-expanded": open,
                    onClick: (event: React.MouseEvent<HTMLElement>) => { trigger.props.onClick?.(event); onOpenChange(true); },
                })}
                <UtilitySheet title={title} open={open} onClose={() => onOpenChange(false)} flush={flush} fit>
                    {children}
                </UtilitySheet>
            </>
        );
    }
    const anchor = <Popover.Trigger asChild>{trigger}</Popover.Trigger>;
    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            {tip ? <Tip label={tip} side="bottom">{anchor}</Tip> : anchor}
            <Popover.Content {...contentProps}>{children}</Popover.Content>
        </Popover.Root>
    );
}
