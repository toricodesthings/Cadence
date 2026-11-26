import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useState, useRef, type ReactNode } from "react";
import { FLOATING_SURFACE } from "./menu-styles";
import { isTouchFirst } from "../../hooks/ui/use-shell-mode";

export const Provider = RadixTooltip.Provider;
const Root = RadixTooltip.Root;
const Trigger = RadixTooltip.Trigger;
const Portal = RadixTooltip.Portal;
const Arrow = RadixTooltip.Arrow;

const Content = ({
    className = "",
    sideOffset = 10,
    ...props
}: RadixTooltip.TooltipContentProps & { ref?: React.Ref<HTMLDivElement> }) => (
    <RadixTooltip.Content
        sideOffset={sideOffset}
        className={[
            FLOATING_SURFACE,
            "pointer-events-none rounded-lg px-3 py-1.5 text-xs text-twilight-text",
            "data-[state=delayed-open]:animate-in data-[state=closed]:animate-out",
            "data-[state=delayed-open]:fade-in data-[state=closed]:fade-out",
            "data-[state=delayed-open]:zoom-in-95 data-[state=closed]:zoom-out-95",
            "origin-(--radix-tooltip-content-transform-origin) duration-150 data-[state=closed]:duration-100",
            className,
        ].join(" ")}
        {...props}
    />
);

export interface TipProps {
    label: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    children: ReactNode;
    disabled?: boolean;
    card?: boolean;
}

const focusedWithoutKeyboard = () => isTouchFirst() && !document.activeElement?.matches(":focus-visible");

export function Tip({ label, side = "right", children, disabled = false, card = false }: TipProps) {
    const [open, setOpen] = useState(false);
    const touch = useRef(false);
    return (
        <Root
            open={open && !disabled}
            onOpenChange={(next) => setOpen(next && !disabled && !touch.current && !focusedWithoutKeyboard())}
        >
            <Trigger
                asChild
                onPointerDown={(event) => {
                    touch.current = event.pointerType === "touch";
                    if (touch.current) setOpen(false);
                }}
                onPointerMove={(event) => {
                    if (event.pointerType === "mouse") touch.current = false;
                }}
            >
                {children}
            </Trigger>
            {!disabled && (
                <Portal>
                    <Content side={side} className={card ? "w-72 overflow-hidden !p-0" : ""}>
                        {label}
                        {!card && <Arrow className="fill-twilight-surface" />}
                    </Content>
                </Portal>
            )}
        </Root>
    );
}
