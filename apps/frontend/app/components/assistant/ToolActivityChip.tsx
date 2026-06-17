import React from "react";
import { Check, Loader2, Inbox, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Tip } from "../primitives";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
/** A short spring used for icons popping in on settle (purposeful, not bouncy). */
const SETTLE_POP = { type: "spring" as const, stiffness: 500, damping: 28 };

/**
 * Read-tool activity chip (design §5). Read tools execute server-side and feed
 * the model; the user needs transparency, not a card. A single low-noise chip,
 * with multiple reads in one turn collapsing into a "Looked a few things up · N"
 * chip whose tooltip lists each label.
 */
export function ToolActivityChip({
    labels,
    pending,
}: {
    /** One label per grouped read call (registry `label`). */
    labels: string[];
    /** True while at least one read is still in-flight. */
    pending?: boolean;
}) {
    const reduceMotion = useReducedMotion();
    const count = labels.length;
    const summary =
        count <= 1 ? (labels[0] ?? "Looked something up") : `Looked a few things up`;
    const ariaLabel = labels.join(", ") || "Looked something up";

    // Pending reads carry the accent tint + a shimmering label so they read as
    // "Cadence is working", settling to a calm neutral chip with a green check.
    const chip = (
        <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-300 ${
                pending
                    ? "border-accent-primary/25 bg-accent-primary/10 text-accent-primary"
                    : "border-twilight-border bg-twilight-surface text-twilight-text-muted"
            }`}
            role="status"
            aria-live="polite"
            aria-label={ariaLabel}
        >
            {/* Attribution: a faint Sparkles marks this as something Cadence ran. */}
            <Sparkles size={10} className={pending ? "text-accent-primary" : "text-accent-primary/50"} />
            {pending ? (
                <Loader2 size={11} className="animate-spin text-accent-primary" />
            ) : (
                <motion.span
                    initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={SETTLE_POP}
                    className="inline-flex"
                >
                    <Check size={11} className="text-feedback-success" />
                </motion.span>
            )}
            <span className={pending && !reduceMotion ? "animate-pulse" : undefined}>{summary}</span>
            {count > 1 ? <span className="opacity-70">· {count}</span> : null}
        </motion.span>
    );

    if (count <= 1) return chip;

    return (
        <Tip
            side="top"
            label={
                <ul className="space-y-0.5 text-[11px]">
                    {labels.map((label, i) => (
                        <li key={i}>{label}</li>
                    ))}
                </ul>
            }
        >
            {chip}
        </Tip>
    );
}

/**
 * Write-confirmation chip for `capture_to_inbox` (design §6). The write already
 * happened server-side; this just confirms it survived, distinct from a read
 * chip by its success accent + verb.
 */
export function WriteConfirmChip({ label }: { label: string }) {
    const reduceMotion = useReducedMotion();
    return (
        <motion.span
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
            className="inline-flex items-center gap-1.5 rounded-full border border-feedback-success/20 bg-feedback-success/10 px-2.5 py-1 text-[11px] text-feedback-success"
            role="status"
            aria-live="polite"
            aria-label={label}
        >
            <motion.span
                initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SETTLE_POP}
                className="inline-flex"
            >
                <Inbox size={11} />
            </motion.span>
            <span>{label}</span>
        </motion.span>
    );
}
