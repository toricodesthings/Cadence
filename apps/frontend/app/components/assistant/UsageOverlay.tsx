import { ArrowRight, ChevronLeft } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import * as ScrollArea from "../primitives/ScrollArea";
import { Tip } from "../primitives";
import { UsageMeters } from "./UsageMeters";
import { useAiUsage } from "../../hooks/ai/use-ai-usage";
import { EASE_OUT_EXPO } from "../../lib/constants/motion";

/**
 * `/usage`: the assistant's limits, overlaid on the thread inside the panel
 * (same envelope as the Conversations drawer), never over the page.
 */
export function UsageOverlay({ onClose, onOpenSettings }: { onClose: () => void; onOpenSettings: () => void }) {
    const reduceMotion = useReducedMotion();
    const { data: usage, isLoading } = useAiUsage(true);

    return (
        <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -12 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="absolute inset-0 z-10 flex flex-col bg-panel/95 backdrop-blur-xl"
            role="dialog"
            aria-label="Usage"
        >
            <header className="flex h-(--shell-header-h) shrink-0 items-center gap-2 border-b border-twilight-border px-4">
                <Tip label="Back to conversation" side="bottom">
                    <button
                        type="button"
                        onClick={onClose}
                        autoFocus
                        className="flex h-9 w-9 items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-twilight-surface-hover hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 cursor-pointer"
                        aria-label="Back to conversation"
                    >
                        <ChevronLeft size={18} />
                    </button>
                </Tip>
                <h2 className="font-display text-lg font-semibold tracking-tight text-twilight-text">Usage</h2>
            </header>

            <ScrollArea.Root className="min-h-0 flex-1">
                <ScrollArea.Viewport className="px-3 py-4">
                    <UsageMeters usage={usage} isLoading={isLoading} />
                    <button
                        type="button"
                        onClick={onOpenSettings}
                        className="mx-auto mt-5 flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-accent-primary transition-colors hover:bg-accent-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 cursor-pointer"
                    >
                        Assistant settings
                        <ArrowRight size={14} aria-hidden />
                    </button>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar>
                    <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>
        </motion.div>
    );
}
