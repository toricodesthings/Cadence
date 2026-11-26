import React from "react";
import * as Popover from "../primitives/Popover";
import { Tip } from "../primitives/Tooltip";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { UtilitySheet } from "./UtilitySheet";

export function PickerSurface({
    trigger,
    title,
    open,
    onOpenChange,
    tip,
    tipCard = false,
    flush = false,
    contentProps,
    children,
}: {
    trigger: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
    title: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tip?: React.ReactNode;
    tipCard?: boolean;
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
                    onClick: (event: React.MouseEvent<HTMLElement>) => {
                        trigger.props.onClick?.(event);
                        onOpenChange(true);
                    },
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
            {tip ? (
                <Tip label={tip} side="bottom" card={tipCard} disabled={tipCard && open}>
                    {anchor}
                </Tip>
            ) : (
                anchor
            )}
            <Popover.Content {...contentProps}>{children}</Popover.Content>
        </Popover.Root>
    );
}
