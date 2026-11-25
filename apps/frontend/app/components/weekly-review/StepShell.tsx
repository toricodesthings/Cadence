import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Check, type LucideIcon } from "lucide-react";
import { Button } from "../primitives/Button";
import { EmptyState } from "../tasks/EmptyState";
import { SPRINGS } from "../../lib/constants/motion";
import { STEPS } from "./WeeklyResetSidebar";

/**
 * One layout for every step: a large title + count, top-anchored at the same height, then the body in a container
 * that lists grow inside by container query. No outer card: only rows and cards carry surfaces.
 */
export function StepShell({
    step,
    title: titleOverride,
    count,
    center = false,
    titleInHeader = false,
    children,
}: {
    step: number;
    /** Welcome: a centred title over a centred body. */
    center?: boolean;
    /** When the page's title isn't the step's name (Welcome reads "Weekly Reset"). */
    title?: string;
    count?: number | null;
    /** The compact header carries the name and count, so the large title is for screen readers only (Welcome keeps its hero). */
    titleInHeader?: boolean;
    children: ReactNode;
}) {
    const stepTitle = STEPS[step].title;
    const title = titleOverride ?? stepTitle;
    return (
        <section
            aria-labelledby={`reset-step-${step}`}
            className="mx-auto flex w-full flex-1 flex-col gap-6 md:max-w-[44rem] lg:max-w-[60rem] 2xl:max-w-[76rem]"
        >
            <header
                className={
                    titleInHeader && !center ? "sr-only" : `flex items-center gap-3 ${center ? "justify-center" : ""}`
                }
            >
                <h1
                    id={`reset-step-${step}`}
                    className="font-display text-[clamp(1.625rem,1.3rem+0.8vw,2.125rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-twilight-text"
                >
                    {title}
                </h1>
                {count ? (
                    <span className="rounded-full bg-accent-primary/12 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-accent-primary">
                        {count}
                    </span>
                ) : null}
            </header>
            <div className="@container flex flex-1 flex-col">{children}</div>
        </section>
    );
}

/** The one bottom bar: Back and Next (Done on the last step), or the batch bar while rows are picked. */
export function StepFooter({
    step,
    onBack,
    onNext,
    onDone,
    children,
}: {
    step: number;
    onBack: () => void;
    onNext: () => void;
    onDone: () => void;
    /** Replaces Back/Next (one bottom bar, never two). */
    children?: ReactNode;
}) {
    const last = step === STEPS.length - 1;
    return (
        <div className="sticky bottom-0 layer-shell-header -mx-4 mt-auto sm:-mx-8 md:-mx-12">
            {/* A scroll-edge fade instead of a border: the content scrolls under the bar. */}
            <div
                aria-hidden="true"
                className="pointer-events-none h-6 bg-[linear-gradient(to_top,color-mix(in_srgb,var(--color-panel)_55%,transparent),transparent)]"
            />
            <div className="surface-shell safe-bottom px-4 py-3 sm:px-8 md:px-12">
                <div className="mx-auto flex w-full items-center gap-2 md:max-w-[44rem] lg:max-w-[60rem] 2xl:max-w-[76rem]">
                    {children ?? (
                        <>
                            {step > 0 ? (
                                <Button variant="ghost" size="md" onClick={onBack} className="gap-1.5">
                                    <ChevronLeft size={16} aria-hidden="true" /> Back
                                </Button>
                            ) : null}
                            <Button
                                variant="primary"
                                size="md"
                                onClick={last ? onDone : onNext}
                                className="ml-auto gap-1.5"
                            >
                                {last ? (
                                    <>
                                        Done <Check size={16} aria-hidden="true" />
                                    </>
                                ) : (
                                    <>
                                        Next <ChevronRight size={16} aria-hidden="true" />
                                    </>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/** An empty step: an icon and two words. Next is in the footer. */
export function StepEmpty({ icon, title }: { icon: LucideIcon; title: string }) {
    return (
        <div className="flex flex-1 flex-col justify-center">
            <EmptyState icon={icon} title={title} description={null} compact />
        </div>
    );
}

/** A row that leaves by closing its gap (height + fade) instead of the list jumping. */
export function ResolvingRow({ children }: { children: ReactNode }) {
    return (
        <motion.div
            layout
            initial={false}
            exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            transition={SPRINGS.SNAP}
        >
            {children}
        </motion.div>
    );
}
