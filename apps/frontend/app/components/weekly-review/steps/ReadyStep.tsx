import { useNavigate } from "react-router";
import { Button } from "../../primitives/Button";
import { ArrowRight, Check } from "lucide-react";
import { motion } from "framer-motion";
import { WeeklyResetHero } from "../../weekly-review/WeeklyResetHero";
import { FURTHER_OUT_OPEN_PARAM } from "../../upcoming/FurtherOutSection";

export type ReadyStepProps = { dueSoonCount: number; onFinish: () => void };

/* ─── Step 4 · Done ─── */
export function ReadyStep({ dueSoonCount, onFinish }: ReadyStepProps) {
    const navigate = useNavigate();
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass flex w-full shrink-0 flex-col items-center justify-center rounded-3xl px-6 py-8 text-center max-w-md mx-auto my-auto"
        >
            <WeeklyResetHero className="mb-5 aspect-[2/1] w-full max-w-[300px]" />
            <div className="w-14 h-14 rounded-2xl bg-accent-primary/15 flex items-center justify-center mb-5">
                <Check size={26} className="text-accent-primary" aria-hidden="true" />
            </div>
            <h1 className="text-2xl font-display font-semibold text-twilight-text mb-2">You're set for the week.</h1>
            <p className={`text-sm text-twilight-text-soft leading-relaxed ${dueSoonCount > 0 ? "mb-2" : "mb-8"}`}>
                Everything's been reviewed. Start wherever feels right.
            </p>
            {/* Opens Upcoming with Further out unfolded, so every one of them is on screen. */}
            {dueSoonCount > 0 ? (
                <button
                    type="button"
                    onClick={() => navigate(`/upcoming?${FURTHER_OUT_OPEN_PARAM}`)}
                    className="mb-6 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm text-twilight-text-soft transition-colors hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                >
                    Due in the next 2 weeks: <span className="tabular-nums font-medium text-twilight-text">{dueSoonCount}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                </button>
            ) : null}
            <Button variant="primary" size="lg" onClick={onFinish} className="w-full max-w-xs justify-center">
                Go to Today <ArrowRight size={16} />
            </Button>
        </motion.div>
    );
}
