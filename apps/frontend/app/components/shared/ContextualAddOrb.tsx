import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, Flame, MessageSquare, Plus, X } from "lucide-react";
import type { QuickAddTab } from "../quick-add/QuickAddSurface";

interface ContextualAddOrbProps {
    onOpen: (tab: QuickAddTab) => void;
}

const OPTIONS: Array<{ tab: QuickAddTab; label: string; icon: typeof CheckSquare }> = [
    { tab: "task", label: "Task", icon: CheckSquare },
    { tab: "capture", label: "Thought", icon: MessageSquare },
    { tab: "habit", label: "Habit", icon: Flame },
];

export function ContextualAddOrb({ onOpen }: ContextualAddOrbProps) {
    const [open, setOpen] = useState(false);

    return (
        <div className="layer-floating-bar pointer-events-none fixed bottom-5 right-4 flex flex-col items-end gap-3 sm:right-5">
            <AnimatePresence>
                {open ? (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        className="pointer-events-auto flex flex-col items-end gap-2"
                    >
                        {OPTIONS.map(({ tab, label, icon: Icon }, index) => (
                            <motion.button
                                key={tab}
                                type="button"
                                initial={{ opacity: 0, x: 16 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 12 }}
                                transition={{ delay: index * 0.03 }}
                                onClick={() => {
                                    onOpen(tab);
                                    setOpen(false);
                                }}
                                className="inline-flex min-h-12 items-center gap-3 rounded-full border border-twilight-border/40 bg-twilight-deep/96 px-4 text-sm font-medium text-twilight-text shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.05] text-lantern">
                                    <Icon size={15} aria-hidden="true" />
                                </span>
                                <span>{label}</span>
                            </motion.button>
                        ))}
                    </motion.div>
                ) : null}
            </AnimatePresence>

            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-label={open ? "Close quick add menu" : "Open quick add menu"}
                className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-lantern/20 bg-lantern text-midnight shadow-[0_24px_54px_rgba(232,164,74,0.34)] transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
                {open ? <X size={18} aria-hidden="true" /> : <Plus size={18} aria-hidden="true" />}
            </button>
        </div>
    );
}
