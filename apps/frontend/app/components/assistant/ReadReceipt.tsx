import React from "react";
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
export function ReadReceipt({ state }: { state: ReceiptState }) {
    const Icon = state === "sent" ? Check : CheckCheck;
    const tint = state === "read" ? "text-accent-primary" : "text-twilight-text-muted";

    return (
        <Tip label={LABELS[state]} side="top">
            <div
                className="mt-1 flex justify-end pr-1"
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
