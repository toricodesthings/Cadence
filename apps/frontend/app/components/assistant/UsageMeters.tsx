import { useEffect, useState } from "react";
import { CalendarRange, Clock, Hourglass, Image, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import type { AiUsage } from "@cadence/contracts/ai";
import { Skeleton } from "../primitives";
import { describeUsageMeters, type UsageMeter } from "../../lib/ai/usage";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";
import { useReducedMotionSetting } from "../../hooks/ui/use-reduced-motion";
import { cn } from "../../lib/utils";

const ICONS: Record<UsageMeter["id"], LucideIcon> = { "5h": Hourglass, "7d": CalendarRange, images: Image };

/**
 * The assistant's limits as filling bars (5-hour, weekly, photos). No shell of
 * its own: the panel's usage overlay and Settings › Assistant both host it.
 */
export function UsageMeters({ usage, isLoading, className }: { usage: AiUsage | undefined; isLoading?: boolean; className?: string }) {
    const reduceMotion = useReducedMotionSetting();
    // Re-render on a slow tick so "Resets in 2 hours 14 minutes" keeps counting down.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const t = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(t);
    }, []);
    const meters = describeUsageMeters(usage, now);

    if (isLoading && !usage) {
        return (
            <div className={cn("flex flex-col gap-3", className)} aria-busy="true">
                {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-[5.5rem] rounded-[1.4rem]" />
                ))}
            </div>
        );
    }

    if (!meters) {
        return (
            <p className={cn("rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4 text-sm leading-relaxed text-twilight-text-soft", className)}>
                Usage isn&rsquo;t available right now. You can keep chatting.
            </p>
        );
    }

    return (
        <ul className={cn("flex flex-col gap-3", className)}>
            {meters.map((meter) => {
                const Icon = ICONS[meter.id];
                const percent = Math.round(meter.fraction * 100);
                return (
                    <li key={meter.id} className="flex flex-col gap-3 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4">
                        <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
                                <Icon size={17} aria-hidden />
                            </span>
                            <span className="flex-1 text-sm font-medium text-twilight-text">{meter.label}</span>
                            <span className={cn("text-sm font-semibold tabular-nums", meter.full ? "text-feedback-error" : "text-twilight-text")}>
                                {meter.headline}
                            </span>
                        </div>
                        <div
                            role="meter"
                            aria-label={meter.label}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={percent}
                            aria-valuetext={[meter.headline, meter.caption, meter.reset].filter(Boolean).join(". ")}
                            className="h-2 overflow-hidden rounded-full bg-twilight-surface"
                        >
                            <motion.div
                                initial={reduceMotion ? false : { width: 0 }}
                                animate={{ width: `${percent}%` }}
                                transition={{ duration: reduceMotion ? 0 : 0.7, ease: EASE_OUT_EXPO }}
                                className={cn("h-full rounded-full", meter.full ? "bg-feedback-error" : "bg-accent-primary")}
                            />
                        </div>
                        <div className="flex flex-col gap-1 text-xs">
                            <p className="text-twilight-text-soft">{meter.caption}</p>
                            {meter.reset ? (
                                <p className="flex items-start gap-1.5 tabular-nums text-twilight-text-soft">
                                    <Clock size={12} className="mt-px shrink-0 opacity-80" aria-hidden />
                                    {meter.reset}
                                </p>
                            ) : null}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
