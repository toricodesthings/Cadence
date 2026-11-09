import { Button } from "../../primitives/Button";
import { ArrowRight, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { WeeklyResetHero } from "../../weekly-review/WeeklyResetHero";
import { trackUsageEvent } from "../../../lib/api/track-event";

/* ─── Step 0 · Intro ─── */
export function IntroStep({ onNext }: { onNext: () => void }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="glass flex w-full shrink-0 flex-col items-center justify-center rounded-3xl px-6 py-8 text-center max-w-md mx-auto my-auto"
        >
            <WeeklyResetHero className="mb-6 aspect-[2/1] w-full max-w-[300px]" />
            <h1 className="text-2xl lg:text-3xl font-display font-semibold text-twilight-text mb-3 leading-tight">
                Weekly Reset
            </h1>
            <p className="text-sm text-twilight-text-soft leading-relaxed mb-4">
                Clear what's accumulated and step into the week with less on your mind.
            </p>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-twilight-border/30 bg-white/[0.03] px-3 py-1 text-xs font-medium text-twilight-text-muted mb-8">
                <Clock size={12} aria-hidden="true" /> About 2 minutes
            </p>
            <Button variant="primary" size="lg" onClick={() => {
                trackUsageEvent("weekly_reset.started", { route: "weekly-review" });
                onNext();
            }}>
                Start <ArrowRight size={16} />
            </Button>
        </motion.div>
    );
}
