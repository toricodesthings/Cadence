import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface ResponsiveOverlayPanelProps {
    ariaLabel: string;
    children: React.ReactNode;
    onClose: () => void;
    open: boolean;
    title: string;
}

export function ResponsiveOverlayPanel({
    ariaLabel,
    children,
    onClose,
    open,
    title,
}: ResponsiveOverlayPanelProps) {
    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        key="overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-twilight-void/70 backdrop-blur-md"
                        onClick={onClose}
                    />

                    <motion.aside
                        key="panel"
                        initial={{ opacity: 0, x: 28 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 28 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={ariaLabel}
                        className="safe-bottom safe-top fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-twilight-border bg-twilight-deep/96 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:max-w-[30rem]"
                    >
                        <div className="flex items-center justify-between gap-3 border-b border-twilight-border px-4 py-4 sm:px-5">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                                    Workspace details
                                </p>
                                <h2 className="mt-1 font-display text-xl font-semibold text-twilight-text">
                                    {title}
                                </h2>
                            </div>

                            <button
                                type="button"
                                onClick={onClose}
                                aria-label={`Close ${title}`}
                                className="btn-icon text-twilight-text-muted hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto">
                            {children}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
