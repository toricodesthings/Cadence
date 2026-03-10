/**
 * Primitive: Separator
 *
 * Pre-themed Radix Separator with Cadence's twilight border color.
 * Domain components import from here — never from @radix-ui/react-separator directly.
 */
import * as RadixSeparator from "@radix-ui/react-separator";
import { forwardRef } from "react";

export const Root = forwardRef<
    HTMLDivElement,
    RadixSeparator.SeparatorProps
>(({ className = "", ...props }, ref) => (
    <RadixSeparator.Root
        ref={ref}
        className={`bg-twilight-border ${props.orientation === "vertical" ? "w-px" : "h-px"} ${className}`}
        {...props}
    />
));
Root.displayName = "Separator";
