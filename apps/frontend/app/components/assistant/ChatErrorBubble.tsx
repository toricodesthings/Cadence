import React, { useState } from "react";
import { AlertCircle, RotateCcw, Copy, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "../primitives/Button";
import type { StreamError } from "../../lib/ai/stream-error";

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/**
 * One inline error bubble for both pre-stream (HTTP) and mid-stream (error part)
 * failures (design §8.1–§8.2). It lives IN the thread (persists), not a toast.
 *
 *  - retryable → a Retry button that re-sends the SAME clientMessageId (idempotent).
 *  - non-retryable → guidance only, no Retry.
 *  - requestId is tucked in a copyable "details" disclosure, never prominent.
 */
export function ChatErrorBubble({
    error,
    onRetry,
}: {
    error: StreamError;
    onRetry?: () => void;
}) {
    const reduceMotion = useReducedMotion();
    const [showDetails, setShowDetails] = useState(false);
    const [copied, setCopied] = useState(false);

    const canRetry = error.isRetryable && !!onRetry;

    const copyDetails = async () => {
        const text = `${error.code}${error.requestId ? ` · ${error.requestId}` : ""}`;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Clipboard unavailable — silently no-op (the line is still readable).
        }
    };

    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: EASE_OUT_EXPO }}
            className="flex items-start gap-2 pl-9"
            role="alert"
        >
            <div className="max-w-[80%] rounded-2xl rounded-bl-md border border-feedback-error/20 bg-feedback-error/10 px-3.5 py-2.5">
                <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0 text-feedback-error" />
                    <p className="text-[14px] leading-relaxed text-twilight-text-soft">{error.message}</p>
                </div>

                <div className="mt-2 flex items-center gap-3">
                    {canRetry ? (
                        <Button
                            variant="cardPrimary"
                            size="none"
                            onClick={onRetry}
                            className="h-8 min-h-8 gap-1.5 rounded-lg px-3 text-xs font-semibold"
                        >
                            <RotateCcw size={12} />
                            Retry
                        </Button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setShowDetails((v) => !v)}
                        className="flex items-center gap-1 text-[11px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft cursor-pointer"
                        aria-expanded={showDetails}
                    >
                        details
                        <ChevronDown
                            size={12}
                            className={`transition-transform ${showDetails ? "rotate-180" : ""}`}
                        />
                    </button>
                </div>

                {showDetails ? (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded bg-twilight-deep/40 px-2 py-1.5">
                        <span className="truncate text-[10px] text-twilight-text-muted">
                            {error.code}
                            {error.requestId ? ` · ${error.requestId}` : ""}
                        </span>
                        <button
                            type="button"
                            onClick={() => void copyDetails()}
                            className="flex shrink-0 items-center gap-1 text-[10px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft cursor-pointer"
                            aria-label="Copy error details"
                        >
                            <Copy size={12} />
                            {copied ? "Copied" : "copy"}
                        </button>
                    </div>
                ) : null}
            </div>
        </motion.div>
    );
}
