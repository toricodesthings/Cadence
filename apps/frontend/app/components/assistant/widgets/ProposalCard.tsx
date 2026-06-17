import React from "react";
import { Check, X, AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button, type ButtonVariant } from "../../primitives/Button";
import { Skeleton } from "../../primitives/Skeleton";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * The shared proposal-card shell (design §3). Every `propose_*` card is the same
 * sanctuary "room": eyebrow + Sparkles-class glyph, an archetype body slot, a
 * two-button action row, and the five states (streaming-skeleton / interactive /
 * resolving / resolved-locked / write-error).
 *
 * Token notes per design §3.2 + §11:
 *  - accent regions use `--accent-primary` indirection (recolor under [data-palette]),
 *  - `glow-accent` not `glow-lantern` so non-Lantern palettes glow in-hue,
 *  - danger/complete swap the frame tint and drop the glow.
 */

export type ProposalCardState =
    | "input-streaming"
    | "input-available"
    | "resolving"
    | "output-available";

export type CardTone = "accent" | "danger" | "success";

const TONE_FRAME: Record<CardTone, string> = {
    accent: "border-accent-primary/20 bg-accent-primary/8 bg-twilight-deep/50 glow-accent",
    danger: "border-feedback-error/20 bg-feedback-error/10 bg-twilight-deep/50",
    success: "border-feedback-success/20 bg-feedback-success/8 bg-twilight-deep/50",
};

const TONE_EYEBROW: Record<CardTone, string> = {
    accent: "text-accent-primary",
    danger: "text-feedback-error",
    success: "text-feedback-success",
};

/** Streaming-skeleton state (§3.3 A) — keeps layout stable, no interaction yet. */
function SkeletonCard() {
    return (
        <div
            className="mt-2 w-full rounded-2xl border border-twilight-border bg-twilight-deep/50 p-3"
            aria-busy="true"
        >
            <Skeleton className="mb-2.5 h-3 w-24" />
            <div className="space-y-2 rounded-lg bg-twilight-deep/40 p-2.5">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
            </div>
            <div className="mt-3 flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 w-16" />
            </div>
        </div>
    );
}

/** Resolved / locked footer (§3.3 D) — italic, muted, never interactive. */
function ResolvedFooter({ committed, text }: { committed: boolean; text: string }) {
    return (
        <div className="mt-2 flex w-full items-center gap-1.5 rounded-xl border border-twilight-border bg-twilight-surface p-3 text-xs italic text-twilight-text-muted">
            {committed ? (
                <Check size={12} className="shrink-0 text-feedback-success" />
            ) : (
                <X size={12} className="shrink-0 text-twilight-text-muted" />
            )}
            <span>{text}</span>
        </div>
    );
}

export function ProposalCard({
    state,
    tone = "accent",
    eyebrow,
    eyebrowGlyph: EyebrowGlyph,
    ariaLabel,
    children,
    primaryLabel,
    primaryGlyph: PrimaryGlyph,
    primaryVariant = "cardPrimary",
    declineLabel = "Not now",
    resolving,
    writeError,
    resolvedCommitted,
    resolvedText,
    onPrimary,
    onDecline,
}: {
    state: ProposalCardState;
    tone?: CardTone;
    eyebrow: string;
    eyebrowGlyph: LucideIcon;
    ariaLabel: string;
    children: React.ReactNode;
    primaryLabel: string;
    primaryGlyph?: LucideIcon;
    primaryVariant?: ButtonVariant;
    declineLabel?: string;
    /** True while the REST confirm write is in flight (§3.3 C). */
    resolving?: boolean;
    /** A calm inline line when the REST write failed (§3.3 E); offers a retry. */
    writeError?: string | null;
    resolvedCommitted?: boolean;
    resolvedText?: string;
    onPrimary?: () => void;
    onDecline?: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const disabled = !!resolving;

    const phase: "skeleton" | "resolved" | "interactive" =
        state === "input-streaming"
            ? "skeleton"
            : state === "output-available"
              ? "resolved"
              : "interactive";

    const fade = {
        initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
        animate: reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
        exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 },
    };

    // A single `layout` parent morphs height as the card moves between phases
    // (streaming skeleton → interactive → resolved footer), so the thread never
    // jumps when a proposal settles. AnimatePresence crossfades the contents.
    return (
        <motion.div layout={!reduceMotion} transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}>
            <AnimatePresence mode="wait" initial={false}>
                {phase === "skeleton" ? (
                    <motion.div key="skeleton" {...fade} transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}>
                        <SkeletonCard />
                    </motion.div>
                ) : phase === "resolved" ? (
                    <motion.div key="resolved" {...fade} transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}>
                        <ResolvedFooter committed={!!resolvedCommitted} text={resolvedText ?? ""} />
                    </motion.div>
                ) : (
                    <motion.div
                        key="interactive"
                        {...fade}
                        transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
                        className={`mt-2 w-full rounded-2xl border p-3 ${TONE_FRAME[tone]}`}
                        role="group"
                        aria-label={ariaLabel}
                    >
                        <div
                            className={`mb-2.5 flex items-center gap-1.5 font-display text-[11px] font-semibold uppercase tracking-wider ${TONE_EYEBROW[tone]}`}
                        >
                            <EyebrowGlyph size={11} />
                            <span>{eyebrow}</span>
                        </div>

                        <div className="space-y-2 text-xs text-twilight-text-soft">{children}</div>

                        {writeError ? (
                            <p className="mt-2.5 flex items-center gap-1 text-[11px] text-feedback-error">
                                <AlertCircle size={12} className="shrink-0" />
                                {writeError}
                            </p>
                        ) : null}

                        <div className="mt-3 flex gap-2">
                            <Button
                                size="none"
                                variant={primaryVariant}
                                className="flex h-8 min-h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-xs font-semibold"
                                disabled={disabled}
                                onClick={onPrimary}
                            >
                                {resolving ? (
                                    <>
                                        <Loader2 size={12} className="animate-spin" />
                                        Saving…
                                    </>
                                ) : (
                                    <>
                                        {PrimaryGlyph ? <PrimaryGlyph size={12} /> : null}
                                        {writeError ? "Try again" : primaryLabel}
                                    </>
                                )}
                            </Button>
                            <Button
                                size="none"
                                variant="ghost"
                                className="h-8 min-h-8 rounded-lg px-3 text-xs text-twilight-text-muted hover:bg-twilight-surface-hover"
                                disabled={disabled}
                                onClick={onDecline}
                            >
                                {declineLabel}
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

/**
 * Identity block (§3.2, P8) — an object glyph + canonical title with the accent
 * left-rule so the user always knows *what* they're approving.
 */
export function IdentityBlock({
    title,
    subtitle,
    tone = "accent",
}: {
    title: string;
    subtitle?: React.ReactNode;
    tone?: CardTone;
}) {
    const rule =
        tone === "danger"
            ? "border-feedback-error"
            : tone === "success"
              ? "border-feedback-success"
              : "border-accent-primary";
    return (
        <div className={`rounded-lg border-l-2 bg-twilight-deep/40 px-2.5 py-1.5 ${rule}`}>
            <p className="text-[13px] font-medium text-twilight-text">{title}</p>
            {subtitle ? <div className="mt-1 text-[11px] text-twilight-text-muted">{subtitle}</div> : null}
        </div>
    );
}

/** A small meta pill (date / duration / project), design §3.2. */
export function MetaPill({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
    return (
        <span className="flex items-center gap-1 rounded bg-twilight-elevated px-1.5 py-0.5 text-[11px] text-twilight-text-soft">
            <Icon size={10} />
            {children}
        </span>
    );
}
