import { useEffect, useState } from "react";
import { Check, CheckCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Tip } from "../primitives";

export type ReceiptState = "sent" | "delivered" | "read";

const LABELS: Record<ReceiptState, string> = {
    sent: "Message sent successfully",
    delivered: "Message delivered",
    read: "Message read",
};

/**
 * iMessage / WhatsApp-style checkmark receipt shown under the latest user
 * message.
 *   - sent      → single muted check (in flight)
 *   - delivered → double muted check (request accepted / streaming begun)
 *   - read      → double accent-tinted check (assistant's turn has started)
 *
 * The icon cross-fades + lifts slightly between states for a tactile feel.
 */
const ORDER: ReceiptState[] = ["sent", "delivered", "read"];
/** Each forward step holds at least this long, so no stage is ever skipped. */
const STEP_MS = 450;

export function ReadReceipt({ state: target }: { state: ReceiptState }) {
    // The shown state walks forward one stage at a time toward the real one: a
    // reply that starts the instant the server accepts still reads sent →
    // delivered → read. It only reaches a stage the real turn has reached (read
    // implies the server accepted), and a first render shows the real state as-is.
    const [state, setState] = useState(target);
    useEffect(() => {
        const at = ORDER.indexOf(state);
        const to = ORDER.indexOf(target);
        if (to < at) setState(target);
        if (to <= at) return;
        const t = window.setTimeout(() => setState(ORDER[at + 1]!), STEP_MS);
        return () => window.clearTimeout(t);
    }, [state, target]);

    const Icon = state === "sent" ? Check : CheckCheck;
    const tint = state === "read" ? "text-accent-primary" : "text-twilight-text-muted";

    return (
        <Tip label={LABELS[state]} side="top">
            <div
                className="flex items-center justify-center"
                aria-label={LABELS[state]}
                role="status"
            >
                <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                        key={state}
                        initial={{ opacity: 0, y: 3, scale: 0.85 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -3, scale: 0.85 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className={`inline-flex ${tint}`}
                    >
                        <Icon size={13} strokeWidth={2.5} />
                    </motion.span>
                </AnimatePresence>
            </div>
        </Tip>
    );
}
