import { ArrowLeft, Flower2, Inbox, ListTodo, Flame, CalendarRange, Check, MessagesSquare } from "lucide-react";
import { Button } from "../primitives/Button";

/** The reset's steps. Ids stay stable (saved step indexes keep working); `stabilize` shows as "Loose ends". */
export const STEPS = [
    { id: "intro", title: "Welcome", icon: Flower2 },
    { id: "inbox", title: "Captures", icon: Inbox },
    { id: "stabilize", title: "Loose ends", icon: ListTodo },
    { id: "habits", title: "Routines", icon: Flame },
    { id: "huddle", title: "Huddle", icon: MessagesSquare },
    { id: "ready", title: "Your week", icon: CalendarRange },
] as const;

export type StepNavProps = {
    currentStep: number;
    /** What's left on each step (null where nothing is counted). */
    counts: readonly (number | null)[];
    onStep: (step: number) => void;
};

/**
 * Any step is one click away: steps are independent, so jumping loses nothing. A path joins the step marks and
 * lights up behind you as you go.
 */
export function WeeklyResetSidebar({ currentStep, counts, onStep, compact = false, onExit }: StepNavProps & { compact?: boolean; onExit: () => void }) {
    return (
        <nav aria-label="Weekly Reset steps" className={`surface-shell photo-shell-surface layer-shell-base ${compact ? "w-[236px]" : "w-[264px]"} relative flex shrink-0 flex-col border-r border-twilight-border py-6`}>
            <div className="mb-8 flex items-center gap-3 px-5">
                <img src="/logo.svg" alt="" className="size-10 rounded-xl object-cover" />
                <span className="font-display text-xl font-semibold text-twilight-text whitespace-nowrap">Weekly Reset</span>
            </div>

            <ol className="flex-1 space-y-2 px-3">
                {STEPS.map((step, idx) => {
                    const isActive = idx === currentStep;
                    const isPast = idx < currentStep;
                    const count = counts[idx];
                    const Icon = isPast && !count ? Check : step.icon;
                    return (
                        <li key={step.id} className="relative">
                            {/* The path to the next mark: a quiet track, lit once you're past this step. */}
                            {idx < STEPS.length - 1 ? (
                                <span aria-hidden="true" className="absolute left-[26px] top-[calc(50%+17px)] h-[22px] w-0.5 overflow-hidden rounded-full bg-twilight-border/60">
                                    <span className={`block size-full origin-top bg-accent-primary transition-transform duration-500 ease-out ${isPast ? "scale-y-100" : "scale-y-0"}`} />
                                </span>
                            ) : null}
                            <button
                                type="button"
                                onClick={() => onStep(idx)}
                                aria-current={isActive ? "step" : undefined}
                                className={`flex h-12 w-full cursor-pointer items-center gap-3.5 rounded-xl px-2.5 text-left text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${
                                    isActive ? "bg-accent-primary/8 text-twilight-text" : "text-twilight-text-soft hover:bg-accent-primary/5 hover:text-twilight-text"
                                }`}
                            >
                                <span className={`relative z-10 flex size-[34px] shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,color] duration-500 ${
                                    isActive ? "border-accent-primary bg-accent-primary/15 text-accent-primary shadow-[0_0_14px_color-mix(in_srgb,var(--accent-primary)_35%,transparent)]"
                                        : isPast ? "border-accent-primary/50 bg-accent-primary/12 text-accent-primary"
                                            : "border-twilight-border bg-twilight-deep text-twilight-text-muted"
                                }`}>
                                    <Icon size={16} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
                                </span>
                                <span className="flex-1 truncate">{step.title}</span>
                                {count ? (
                                    <span className="min-w-7 rounded-full bg-accent-primary/12 px-2 py-0.5 text-center text-[0.8125rem] font-semibold tabular-nums text-accent-primary" aria-label={`${count} left`}>
                                        {count}
                                    </span>
                                ) : null}
                            </button>
                        </li>
                    );
                })}
            </ol>

            <div className="mt-auto px-3">
                <Button variant="ghost" size="md" onClick={onExit} className="w-full justify-start gap-3 whitespace-nowrap">
                    <ArrowLeft size={16} aria-hidden="true" />
                    <span>Save &amp; exit</span>
                </Button>
            </div>
        </nav>
    );
}
