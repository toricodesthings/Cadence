import { useState } from "react";
import { Check, ChevronRight, LoaderCircle, Inbox, X } from "lucide-react";
import { AssistantSigil } from "./AssistantSigil";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "../shared/Reveal";
import { EASE_OUT_EXPO, SPRINGS } from "../../lib/constants/motion";

const SETTLE_POP = SPRINGS.SNAP;

export interface ToolCall {
    label: string;
    tool?: string;
    input?: unknown;
    pending?: boolean;
    failed?: boolean;
}

function formatInput(input: unknown): string {
    if (input == null) return "";
    if (typeof input !== "object") return JSON.stringify(input);
    return Object.entries(input as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join(", ");
}

export function ToolActivityChip({ calls, pending }: { calls: ToolCall[]; pending?: boolean }) {
    const reduceMotion = useReducedMotion();
    const [open, setOpen] = useState(false);
    const labels = [...new Set(calls.map((c) => c.label))];
    const count = labels.length;
    const summary = count <= 1 ? (labels[0] ?? "Looked something up") : `Looked a few things up`;
    const expandable = calls.some((c) => c.tool);
    const failed = !pending && calls.some((c) => c.failed);

    return (
        <div className="flex flex-col items-start gap-1.5" role="status" aria-live="polite">
            <motion.button
                type="button"
                disabled={!expandable}
                onClick={() => setOpen((o) => !o)}
                aria-expanded={expandable ? open : undefined}
                aria-label={`${labels.join(", ") || "Looked something up"}${failed ? ", something failed" : ""}${expandable ? (open ? ", hide details" : ", show details") : ""}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, ease: EASE_OUT_EXPO }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-300 enabled:cursor-pointer enabled:hover:brightness-125 ${
                    pending
                        ? "border-accent-primary/25 bg-accent-primary/10 text-accent-primary"
                        : "border-twilight-border bg-twilight-surface text-twilight-text-muted"
                }`}
            >
                <AssistantSigil size={12} className={pending ? "text-accent-primary" : "text-accent-primary/60"} />
                {pending ? (
                    <LoaderCircle size={11} className="animate-spin text-accent-primary" />
                ) : (
                    <motion.span
                        initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={SETTLE_POP}
                        className="inline-flex"
                    >
                        {failed ? (
                            <X size={11} className="text-feedback-error" />
                        ) : (
                            <Check size={11} className="text-feedback-success" />
                        )}
                    </motion.span>
                )}
                <span className={pending && !reduceMotion ? "animate-pulse" : undefined}>{summary}</span>
                {calls.length > 1 ? <span className="opacity-70">· {calls.length}</span> : null}
                {expandable ? (
                    <ChevronRight size={11} className={`opacity-60 transition-transform ${open ? "rotate-90" : ""}`} />
                ) : null}
            </motion.button>
            <Reveal open={open} className="w-full">
                <ul className="w-full max-w-full space-y-1 rounded-xl border border-twilight-border bg-twilight-surface px-3 py-2 text-[11px] text-twilight-text-muted">
                    {calls.map((c, i) => {
                        const args = formatInput(c.input);
                        return (
                            <li key={i} className="flex min-w-0 items-center gap-2">
                                {c.pending ? (
                                    <LoaderCircle size={10} className="shrink-0 animate-spin text-accent-primary" />
                                ) : c.failed ? (
                                    <X size={10} className="shrink-0 text-feedback-error" aria-label="Failed" />
                                ) : (
                                    <Check size={10} className="shrink-0 text-feedback-success" />
                                )}
                                <span className="shrink-0">{c.label}</span>
                                {c.tool ? (
                                    <code
                                        className="min-w-0 truncate font-mono text-[10px] opacity-70"
                                        title={`${c.tool}(${args})`}
                                    >
                                        {c.tool}({args})
                                    </code>
                                ) : null}
                            </li>
                        );
                    })}
                </ul>
            </Reveal>
        </div>
    );
}

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
