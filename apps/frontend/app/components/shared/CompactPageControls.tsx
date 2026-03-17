import type { ReactNode } from "react";

interface CompactPageControlsProps {
    primaryControl?: ReactNode;
    secondaryControl?: ReactNode;
    controlsTrigger?: ReactNode;
    sticky?: boolean;
    compressedOnScroll?: boolean;
    className?: string;
}

/**
 * Shared compact route controls row for phone/tablet layouts.
 * Routes get one primary context control plus up to two secondary affordances.
 */
export function CompactPageControls({
    primaryControl,
    secondaryControl,
    controlsTrigger,
    sticky = false,
    compressedOnScroll = false,
    className = "",
}: CompactPageControlsProps) {
    if (!primaryControl && !secondaryControl && !controlsTrigger) {
        return null;
    }

    return (
        <div
            data-sticky={sticky ? "true" : "false"}
            data-compressed-on-scroll={compressedOnScroll ? "true" : "false"}
            className={[
                "flex min-h-11 items-center gap-2 overflow-hidden rounded-[1.35rem] border border-twilight-border/40 bg-white/[0.03] p-1.5 backdrop-blur-xl",
                sticky ? "supports-[backdrop-filter]:bg-twilight-deep/55" : "",
                className,
            ].join(" ").trim()}
        >
            {primaryControl ? (
                <div className="min-w-0 flex-1 [&>*]:w-full">
                    {primaryControl}
                </div>
            ) : null}

            {secondaryControl ? (
                <div className="shrink-0 [&>*]:max-w-full">
                    {secondaryControl}
                </div>
            ) : null}

            {controlsTrigger ? (
                <div className="shrink-0 [&>*]:max-w-full">
                    {controlsTrigger}
                </div>
            ) : null}
        </div>
    );
}
