/**
 * @file app/components/primitives/Skeleton.tsx
 * @description Domain components import from here. Provides a sweeping glow skeleton.
 */

import * as React from "react";
import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="skeleton"
            className={cn(
                "relative overflow-hidden rounded-xl bg-white/[0.04] animate-pulse",
                "before:absolute before:inset-0",
                "before:-translate-x-full",
                "before:animate-[shimmer_2s_infinite_ease-out]",
                "before:bg-gradient-to-r before:blur-sm",
                "before:from-transparent before:from-[10%] before:via-white/[0.08] before:via-[50%] before:to-transparent before:to-[90%]",
                className,
            )}
            {...props}
        />
    );
}

export { Skeleton };
