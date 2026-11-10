import { ArrowRight, Clock, Flame, Inbox, ListTodo, type LucideIcon } from "lucide-react";
import { Button } from "../../primitives/Button";
import { WeeklyResetHero } from "../../weekly-review/WeeklyResetHero";
import { trackUsageEvent } from "../../../lib/api/track-event";
import { StepShell } from "../StepShell";

/** What's waiting, as the first stretch of the path the sidebar walks: three marks joined by a faint line. */
function WaitingPath({ items }: { items: { icon: LucideIcon; count: number; label: string }[] }) {
    return (
        <ol className="flex items-start justify-center">
            {items.map(({ icon: Icon, count, label }, i) => (
                <li key={label} className="flex items-start">
                    {i > 0 ? <span aria-hidden="true" className="mt-[21px] h-0.5 w-6 rounded-full bg-accent-primary/25 @md:w-12" /> : null}
                    <span className="flex w-24 flex-col items-center gap-1 text-center @md:w-28">
                        <span className={`flex size-11 items-center justify-center rounded-full border ${count ? "border-accent-primary/40 bg-accent-primary/10 text-accent-primary" : "border-twilight-border text-twilight-text-muted"}`}>
                            <Icon size={18} aria-hidden="true" />
                        </span>
                        <span className={`mt-1 font-display text-2xl font-semibold leading-none tabular-nums ${count ? "text-twilight-text" : "text-twilight-text-muted"}`}>{count}</span>
                        <span className="text-sm text-twilight-text-soft">{label}</span>
                    </span>
                </li>
            ))}
        </ol>
    );
}

/* ─── Step 0 · Welcome ─── */
export function IntroStep({ counts, onNext, onTitleVisible }: {
    counts: { captures: number; looseEnds: number; routines: number };
    onNext: () => void;
    onTitleVisible?: (visible: boolean) => void;
}) {
    const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
    return (
        <StepShell step={0} title="Weekly Reset" center onTitleVisible={onTitleVisible}>
            <div className="flex flex-col items-center gap-6">
                <WeeklyResetHero className="-my-4 aspect-[2/1] w-full max-w-[440px] 2xl:max-w-[560px]" />
                <WaitingPath items={[
                    { icon: Inbox, count: counts.captures, label: plural(counts.captures, "thought", "thoughts") },
                    { icon: ListTodo, count: counts.looseEnds, label: plural(counts.looseEnds, "loose end", "loose ends") },
                    { icon: Flame, count: counts.routines, label: plural(counts.routines, "routine", "routines") },
                ]} />
                <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button variant="primary" size="lg" className="gap-2" onClick={() => {
                        trackUsageEvent("weekly_reset.started", { route: "weekly-review" });
                        onNext();
                    }}>
                        Let's go <ArrowRight size={16} aria-hidden="true" />
                    </Button>
                    <span className="surface-control inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm text-twilight-text-soft">
                        <Clock size={14} aria-hidden="true" /> About 2 min
                    </span>
                </div>
            </div>
        </StepShell>
    );
}
