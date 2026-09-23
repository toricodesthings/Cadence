import { useState } from "react";
import { Check, ChevronRight, Loader2, Inbox } from "lucide-react";
import { AssistantSigil } from "./AssistantSigil";
import { motion, useReducedMotion } from "framer-motion";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";

/** A short spring used for icons popping in on settle (purposeful, not bouncy). */
const SETTLE_POP = { type: "spring" as const, stiffness: 500, damping: 28 };

/** One read call inside a grouped chip. */
export interface ToolCall {
    /** Registry `label` (plain-language). */
    label: string;
    /** Raw tool name, shown to power users when expanded. */
    tool?: string;
    /** Tool arguments as the model sent them. */
    input?: unknown;
    pending?: boolean;
}

/** `{ status: "overdue", limit: 20 }` → `status: "overdue", limit: 20`. */
function formatInput(input: unknown): string {
    if (input == null) return "";
    if (typeof input !== "object") return JSON.stringify(input);
    return Object.entries(input as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ");
}

/**
 * Read-tool activity chip (design §5). Read tools execute server-side and feed
 * the model; the user needs transparency, not a card. A single low-noise chip,
 * with multiple reads in one turn collapsing into a "Looked a few things up · N"
 * chip. Clicking it expands the exact calls (tool + arguments + status).
 */
export function ToolActivityChip({ calls, pending }: { calls: ToolCall[]; /** True while any read is in-flight. */ pending?: boolean }) {
    const reduceMotion = useReducedMotion();
    const [open, setOpen] = useState(false);
    // Three task lookups in a row still read as one "Checked your tasks".
    const labels = [...new Set(calls.map((c) => c.label))];
    const count = labels.length;
    const summary =
        count <= 1 ? (labels[0] ?? "Looked something up") : `Looked a few things up`;
    const expandable = calls.some((c) => c.tool);

    // Pending reads carry the accent tint + a shimmering label so they read as
    // "Cadence is working", settling to a calm neutral chip with a green check.
    return (
        <div className="flex flex-col items-start gap-1.5" role="status" aria-live="polite">
            <motion.button
                type="button"
                disabled={!expandable}
                onClick={() => setOpen((o) => !o)}
                aria-expanded={expandable ? open : undefined}
                aria-label={`${labels.join(", ") || "Looked something up"}${expandable ? (open ? ", hide details" : ", show details") : ""}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-300 enabled:cursor-pointer enabled:hover:brightness-125 ${
                    pending
                        ? "border-accent-primary/25 bg-accent-primary/10 text-accent-primary"
                        : "border-twilight-border bg-twilight-surface text-twilight-text-muted"
                }`}
            >
                {/* Attribution: a faint sigil marks this as something Cadence ran. */}
                <AssistantSigil size={12} className={pending ? "text-accent-primary" : "text-accent-primary/60"} />
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
                {calls.length > 1 ? <span className="opacity-70">· {calls.length}</span> : null}
                {expandable ? (
                    <ChevronRight size={11} className={`opacity-60 transition-transform ${open ? "rotate-90" : ""}`} />
                ) : null}
            </motion.button>
            {open ? (
                <ul className="w-full max-w-full space-y-1 rounded-xl border border-twilight-border bg-twilight-surface px-3 py-2 text-[11px] text-twilight-text-muted">
                    {calls.map((c, i) => {
                        const args = formatInput(c.input);
                        return (
                            <li key={i} className="flex min-w-0 items-center gap-2">
                                {c.pending ? (
                                    <Loader2 size={10} className="shrink-0 animate-spin text-accent-primary" />
                                ) : (
                                    <Check size={10} className="shrink-0 text-feedback-success" />
                                )}
                                <span className="shrink-0">{c.label}</span>
                                {c.tool ? (
                                    <code className="min-w-0 truncate font-mono text-[10px] opacity-70" title={`${c.tool}(${args})`}>
                                        {c.tool}({args})
                                    </code>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
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
