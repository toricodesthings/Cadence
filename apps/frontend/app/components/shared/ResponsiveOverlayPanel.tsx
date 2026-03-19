import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useCallback } from "react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";

interface ResponsiveOverlayPanelProps {
    ariaLabel: string;
    children: React.ReactNode;
    onClose: () => void;
    open: boolean;
    title?: string;
    showHeader?: boolean;
    mode?: "peek" | "focus";
}

const SWIPE_THRESHOLD = 80;

export function ResponsiveOverlayPanel({
    ariaLabel,
    children,
    onClose,
    open,
    title,
    showHeader = false,
    mode = "peek",
}: ResponsiveOverlayPanelProps) {
    const shell = useShellMode();
    const isMobile = shell.isCompact;
    const isFocus = mode === "focus";
    const isPeekMobile = isMobile && !isFocus;

    const handleDragEnd = useCallback(
        (_: unknown, info: PanInfo) => {
            if (info.offset.y > SWIPE_THRESHOLD || info.velocity.y > 300) {
                onClose();
            }
        },
        [onClose],
    );

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
                        initial={isMobile ? { opacity: 0, y: isFocus ? 16 : 32 } : { opacity: 0, x: 28 }}
                        animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
                        exit={isMobile ? { opacity: 0, y: isFocus ? 16 : 32 } : { opacity: 0, x: 28 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        role="dialog"
                        aria-modal="true"
                        aria-label={ariaLabel}
                        /* Swipe-to-dismiss for mobile peek sheets (C4 fix) */
                        drag={isPeekMobile ? "y" : false}
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.15}
                        onDragEnd={isPeekMobile ? handleDragEnd : undefined}
                        className={[
                            "mobile-sheet-shell fixed z-50 flex w-full flex-col bg-twilight-deep/96 shadow-2xl shadow-black/40 backdrop-blur-2xl",
                            isMobile
                                ? isFocus
                                    ? "safe-bottom safe-top inset-0 border-none"
                                    : "safe-bottom fixed inset-x-0 bottom-0 top-auto h-[min(92dvh,48rem)] rounded-t-[2rem] border-t border-twilight-border"
                                : "safe-bottom safe-top inset-y-0 right-0 border-l border-twilight-border",
                        ].join(" ")}
                    >
                        {/* ── Mobile grabber bar — swipe affordance (C4 fix) ── */}
                        {isPeekMobile && (
                            <div className="flex justify-center py-2.5" aria-hidden="true">
                                <div className="h-1 w-10 rounded-full bg-twilight-text-muted/25" />
                            </div>
                        )}

                        {showHeader && title ? (
                            <div className="mobile-sheet-header flex items-center justify-between gap-3 border-b border-twilight-border px-4 py-4 sm:px-5">
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
                        ) : null}

                        <div className="mobile-sheet-body scrollbar-thin">
                            {children}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
