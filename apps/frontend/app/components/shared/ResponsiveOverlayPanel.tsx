import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { ToasterFocusBranch } from "../primitives/Dialog";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useKeyboardInset } from "../../hooks/ui/use-keyboard-inset";
import { useSheetGesture } from "../../hooks/ui/use-sheet-gesture";

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
    /** Phone peek sheets: size to the content (still capped) instead of the fixed tall height. */
    fit?: boolean;
    /** `room`: opened from a full-screen room (e.g. the note room), so it stacks above it. */
    layer?: "route" | "room";
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
    fit = false,
    layer = "route",
}: ResponsiveOverlayPanelProps) {
    const shell = useShellMode();
    // A bottom sheet (with its drag handle) is a touch gesture: a mouse gets the side panel at any width.
    const isMobile = shell.isCompact && shell.isTouch;
    const isFocus = mode === "focus";
    const isPeekMobile = isMobile && !isFocus;
    // The keyboard never covers a sheet: it rides on top, footer controls (day, submit) just above the keys,
    // as in the writing room. iOS keeps fixed elements in the layout viewport, under the keyboard.
    const { inset: keyboard } = useKeyboardInset(open && isMobile);
    const aboveKeyboard = keyboard ? `calc(100dvh - ${keyboard}px - max(0.5rem, env(safe-area-inset-top)))` : null;
    const panelRef = useRef<HTMLElement | null>(null);
    const [panel, setPanel] = useState<HTMLElement | null>(null);
    const attachPanel = useCallback((node: HTMLElement | null) => { panelRef.current = node; setPanel(node); }, []);
    // Grab anywhere. Enter and exit are CSS (`.sheet-*` in app.css), so a throw leaves from the finger.
    const { y, backdropOpacity } = useSheetGesture({ element: panel, enabled: open && isPeekMobile, onDismiss: onClose });

    return (
        <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className={`${layer === "room" ? "layer-room-sheet-backdrop" : "layer-route-backdrop"} sheet-fade fixed inset-0`}>
                    {/* Lightens as the sheet is pulled down; the outer layer keeps the enter/exit fade. */}
                    <motion.div style={{ opacity: backdropOpacity }} className="absolute inset-0 bg-twilight-void/85" />
                </DialogPrimitive.Overlay>

                <DialogPrimitive.Content
                    asChild
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                        const panel = panelRef.current;
                        const target = panel?.querySelector<HTMLElement>("[data-initial-focus]") ?? panel?.querySelector<HTMLElement>("[data-sheet-heading]");
                        if (!target) return;
                        event.preventDefault();
                        target.focus();
                    }}
                    // Radix sees Escape before any child; a control that keeps Escape for itself says so.
                    onEscapeKeyDown={(event) => {
                        if ((event.target as Element | null)?.closest?.("[data-escape-owner]")) event.preventDefault();
                    }}
                >
                    <motion.aside
                        ref={attachPanel}
                        style={isPeekMobile
                            ? {
                                y,
                                height: fit ? "auto" : aboveKeyboard ?? "min(92dvh, 52rem)",
                                maxHeight: aboveKeyboard ?? "min(92dvh, 52rem)",
                                bottom: keyboard || undefined,
                                width: "100%",
                                maxWidth: shell.isTablet ? "48rem" : undefined,
                                marginInline: "auto",
                            }
                            : isMobile && keyboard ? { bottom: keyboard } : undefined}
                        className={[
                            `mobile-sheet-shell ${isPeekMobile ? "sheet-up" : isMobile ? "sheet-rise" : "sheet-side"} ${layer === "room" ? "layer-room-sheet" : "layer-route-overlay"} surface-route-overlay fixed flex w-full flex-col shadow-2xl shadow-black/40`,
                            isMobile
                                ? isFocus
                                    ? "safe-bottom safe-top inset-0 border-none"
                                    : `glass-edge safe-bottom fixed inset-x-0 bottom-0 top-auto ${fit ? "" : "h-[min(92dvh,48rem)]"} rounded-t-[2rem] border-t border-twilight-border`
                                : "safe-bottom safe-top inset-y-0 right-0 border-l border-twilight-border",
                        ].join(" ")}
                    >
                        {isPeekMobile && (
                            <div data-sheet-handle className="flex h-8 shrink-0 items-center justify-center" aria-hidden="true">
                                <div className="h-1 w-10 rounded-full bg-twilight-text-soft/40" />
                            </div>
                        )}

                        {showHeader && title ? null : (
                            <DialogPrimitive.Title className="sr-only">{ariaLabel}</DialogPrimitive.Title>
                        )}

                        {showHeader && title ? (
                            <div className="mobile-sheet-header flex items-center justify-between gap-3 border-b border-twilight-border px-4 py-4 sm:px-5">
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                                        Workspace details
                                    </p>
                                    <DialogPrimitive.Title data-sheet-heading tabIndex={-1} className="mt-1 font-display text-xl font-semibold text-twilight-text">
                                        {title}
                                    </DialogPrimitive.Title>
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

                        <ToasterFocusBranch />

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
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
