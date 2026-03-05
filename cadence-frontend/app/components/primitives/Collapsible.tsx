/**
 * Primitive: Collapsible
 *
 * Radix Collapsible — re-exported for consistency.
 * Domain components import from here — never from @radix-ui/react-collapsible directly.
 */
import * as RadixCollapsible from "@radix-ui/react-collapsible";
import { forwardRef } from "react";

export const Root = RadixCollapsible.Root;
export const Content = RadixCollapsible.Content;

export const Trigger = forwardRef<
    HTMLButtonElement,
    RadixCollapsible.CollapsibleTriggerProps
>(({ className = "", ...props }, ref) => (
    <RadixCollapsible.Trigger
        ref={ref}
        className={`cursor-pointer ${className}`}
        {...props}
    />
));
Trigger.displayName = "Collapsible.Trigger";
