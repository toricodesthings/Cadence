import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "../../lib/utils"

const Switch = ({ className, ...props }: React.ComponentProps<typeof SwitchPrimitives.Root>) => (
    <SwitchPrimitives.Root
        className={cn(
            "group peer relative inline-flex h-11 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-base disabled:cursor-not-allowed disabled:opacity-50",
            "after:absolute after:left-1 after:h-5 after:w-9 after:rounded-full after:border after:border-transparent after:shadow-sm after:transition-colors",
            "data-[state=checked]:after:bg-accent-primary data-[state=unchecked]:after:bg-white/10 data-[state=unchecked]:after:border-white/5",
            className
        )}
        {...props}
    >
        <SwitchPrimitives.Thumb
            className={cn(
                "pointer-events-none relative z-10 ml-1 block h-4 w-4 rounded-full bg-twilight-text shadow-sm ring-0 [transition:translate_var(--spring-snap),scale_var(--spring-snap),filter_var(--duration-fast)] data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 group-active:scale-x-125 group-active:brightness-110"
            )}
        />
    </SwitchPrimitives.Root>
);

export { Switch }
