import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useShellMode } from "../../hooks/ui/use-shell-mode";

interface ResponsiveOverlayPanelProps {
    ariaLabel: string;
    children: React.ReactNode;
    onClose: () => void;
    open: boolean;
    title?: string;
    showHeader?: boolean;
    mode?: "peek" | "focus";
    /** When true, the children own the full sheet body as a flex column (header,
     * scroll region, pinned footer) instead of sitting inside the default
     * auto-scrolling body. Used by surfaces like the assistant that manage their
     * own scroll + composer. */
    fill?: boolean;
}

const SWIPE_THRESHOLD = 80;
const FOCUSABLE_SELECTOR = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(", ");

let overlayLockCount = 0;

function getFocusableElements(container: HTMLElement | null) {
    if (!container) return [];

    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true",
    );
}

export function ResponsiveOverlayPanel({
    ariaLabel,
    children,
    onClose,
    open,
    title,
    showHeader = false,
    mode = "peek",
    fill = false,
}: ResponsiveOverlayPanelProps) {
    const shell = useShellMode();
    const isMobile = shell.isCompact;
    const isFocus = mode === "focus";
    const isPeekMobile = isMobile && !isFocus;
    const labelId = useId();
    const panelRef = useRef<HTMLElement | null>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    const inertStateRef = useRef<Array<{ element: HTMLElement; ariaHidden: string | null; inert: boolean }>>([]);
    const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (typeof document === "undefined") return;

        const node = document.createElement("div");
        node.dataset.cadenceOverlayRoot = "true";
        document.body.appendChild(node);
        setPortalNode(node);

        return () => {
            node.remove();
        };
    }, []);

    useEffect(() => {
        if (!open || typeof document === "undefined") return;

        restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        overlayLockCount += 1;

        const previousOverflow = document.body.style.overflow;
        const previousOverscroll = document.body.style.overscrollBehavior;
        document.body.style.overflow = "hidden";
        document.body.style.overscrollBehavior = "contain";

        if (portalNode) {
            const bodyChildren = Array.from(document.body.children);
            inertStateRef.current = bodyChildren
                .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== portalNode)
                .map((element) => {
                    const previous = {
                        element,
                        ariaHidden: element.getAttribute("aria-hidden"),
                        inert: element.inert,
                    };
                    element.inert = true;
                    element.setAttribute("aria-hidden", "true");
                    return previous;
                });
        }

        const frame = window.requestAnimationFrame(() => {
            const focusables = getFocusableElements(panelRef.current);
            focusables[0]?.focus();
        });

        return () => {
            window.cancelAnimationFrame(frame);

            inertStateRef.current.forEach(({ element, ariaHidden, inert }) => {
                element.inert = inert;
                if (ariaHidden === null) {
                    element.removeAttribute("aria-hidden");
                } else {
                    element.setAttribute("aria-hidden", ariaHidden);
                }
            });
            inertStateRef.current = [];

            overlayLockCount = Math.max(overlayLockCount - 1, 0);
            if (overlayLockCount === 0) {
                document.body.style.overflow = previousOverflow;
                document.body.style.overscrollBehavior = previousOverscroll;
            }

            restoreFocusRef.current?.focus?.();
        };
    }, [open, portalNode]);

    const handleDragEnd = useCallback(
        (_: unknown, info: PanInfo) => {
            if (info.offset.y > SWIPE_THRESHOLD || info.velocity.y > 300) {
                onClose();
            }
        },
        [onClose],
    );

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const focusables = getFocusableElements(panelRef.current);
            if (focusables.length === 0) {
                event.preventDefault();
                panelRef.current?.focus();
                return;
            }

            const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
            const nextIndex = event.shiftKey
                ? (currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1)
                : (currentIndex === focusables.length - 1 ? 0 : currentIndex + 1);

            event.preventDefault();
            focusables[nextIndex]?.focus();
        },
        [onClose],
    );

    const overlay = useMemo(() => {
        if (!portalNode) return null;

        return createPortal(
            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            key="overlay"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="layer-route-backdrop fixed inset-0 bg-twilight-void/78 backdrop-blur-md"
                            onClick={onClose}
                        />

                        <motion.aside
                            key="panel"
                            ref={panelRef}
                            initial={isMobile ? { opacity: 0, y: isFocus ? 16 : 32 } : { opacity: 0, x: 28 }}
                            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
                            exit={isMobile ? { opacity: 0, y: isFocus ? 16 : 32 } : { opacity: 0, x: 28 }}
                            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby={showHeader && title ? labelId : undefined}
                            aria-label={showHeader && title ? undefined : ariaLabel}
                            tabIndex={-1}
                            onKeyDown={handleKeyDown}
                            drag={isPeekMobile ? "y" : false}
                            dragConstraints={{ top: 0 }}
                            dragElastic={0.15}
                            onDragEnd={isPeekMobile ? handleDragEnd : undefined}
                            className={[
                                "mobile-sheet-shell layer-route-overlay surface-route-overlay fixed flex w-full flex-col shadow-2xl shadow-black/40",
                                isMobile
                                    ? isFocus
                                        ? "safe-bottom safe-top inset-0 border-none"
                                        : "safe-bottom fixed inset-x-0 bottom-0 top-auto h-[min(92dvh,48rem)] rounded-t-[2rem] border-t border-twilight-border"
                                    : "safe-bottom safe-top inset-y-0 right-0 border-l border-twilight-border",
                            ].join(" ")}
                        >
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
                                        <h2 id={labelId} className="mt-1 font-display text-xl font-semibold text-twilight-text">
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

                            {fill ? (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    {children}
                                </div>
                            ) : (
                                <div className="mobile-sheet-body scrollbar-thin">
                                    {children}
                                </div>
                            )}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>,
            portalNode,
        );
    }, [ariaLabel, children, fill, handleDragEnd, handleKeyDown, isFocus, isMobile, isPeekMobile, labelId, onClose, open, portalNode, showHeader, title]);

    return overlay;
}
