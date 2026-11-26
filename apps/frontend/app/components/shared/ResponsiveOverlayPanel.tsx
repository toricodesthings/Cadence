// oxlint-disable-next-line eslint/no-restricted-imports -- this panel is the sheet primitive
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, type MotionValue } from "framer-motion";
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
    fill?: boolean;
    fit?: boolean;
    layer?: "route" | "room";
    onExpand?: () => void;
}

type SheetShape = {
    isPeekMobile: boolean;
    isMobile: boolean;
    isFocus?: boolean;
    keyboard: number;
    aboveKeyboard: string | null;
    fit: boolean;
    isTablet?: boolean;
    layer?: "route" | "room";
};

function sheetStyle(
    { isPeekMobile, isMobile, keyboard, aboveKeyboard, fit, isTablet }: SheetShape,
    y: MotionValue<number>,
) {
    if (isPeekMobile) {
        return {
            y,
            height: fit ? "auto" : (aboveKeyboard ?? "min(92dvh, 52rem)"),
            maxHeight: aboveKeyboard ?? "min(92dvh, 52rem)",
            bottom: keyboard || undefined,
            width: "100%",
            maxWidth: isTablet ? "48rem" : undefined,
            marginInline: "auto",
        };
    }
    return isMobile && keyboard ? { bottom: keyboard } : undefined;
}

function sheetClass({
    isPeekMobile,
    isMobile,
    isFocus,
    fit,
    fill,
    layer,
}: Omit<SheetShape, "keyboard" | "aboveKeyboard"> & { fill: boolean }) {
    const motionClass = isPeekMobile ? "sheet-up" : isMobile ? "sheet-rise" : "sheet-side";
    const layerClass = layer === "room" ? "layer-room-sheet" : "layer-route-overlay";
    return [
        `mobile-sheet-shell ${motionClass} ${layerClass} surface-route-overlay fixed flex w-full flex-col shadow-2xl shadow-black/40`,
        shapeClass(isMobile, isFocus, fit, fill),
    ].join(" ");
}

function shapeClass(isMobile: boolean, isFocus: boolean | undefined, fit: boolean, fill: boolean) {
    const pad = fill ? "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" : "safe-bottom safe-top";
    if (!isMobile) return `${pad} inset-y-0 right-0 border-l border-twilight-border`;
    if (isFocus) return "safe-bottom safe-top inset-0 border-none";
    return `glass-edge safe-bottom fixed inset-x-0 bottom-0 top-auto ${fit ? "" : "h-[min(92dvh,48rem)]"} rounded-t-[2rem] border-t border-twilight-border`;
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
    return (
        <div className="mobile-sheet-header flex items-center justify-between gap-3 border-b border-twilight-border px-4 py-4 sm:px-5">
            <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-twilight-text-soft">
                    Workspace details
                </p>
                <DialogPrimitive.Title
                    data-sheet-heading
                    tabIndex={-1}
                    className="mt-1 font-display text-xl font-semibold text-twilight-text"
                >
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
    );
}

const BACKDROP_LAYER = { room: "layer-room-sheet-backdrop", route: "layer-route-backdrop" } as const;

function focusInitial(panel: HTMLElement | null, event: Event) {
    const target =
        panel?.querySelector<HTMLElement>("[data-initial-focus]") ??
        panel?.querySelector<HTMLElement>("[data-sheet-heading]");
    if (!target) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
}

function keepOwnedEscape(event: KeyboardEvent) {
    if ((event.target as Element | null)?.closest?.("[data-escape-owner]")) event.preventDefault();
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
    onExpand,
}: ResponsiveOverlayPanelProps) {
    const shell = useShellMode();
    const isMobile = shell.isCompact && shell.isTouch;
    const isFocus = mode === "focus";
    const isPeekMobile = isMobile && !isFocus;
    const live = useKeyboardInset(open && isMobile);
    const [held, setHeld] = useState({ inset: 0, aboveKeyboard: null as string | null });
    if (open && (held.inset !== live.inset || held.aboveKeyboard !== live.aboveKeyboard))
        setHeld({ inset: live.inset, aboveKeyboard: live.aboveKeyboard });
    const { inset: keyboard, aboveKeyboard } = open ? live : held;
    const panelRef = useRef<HTMLElement | null>(null);
    const openerRef = useRef<HTMLElement | null>(null);
    const [panel, setPanel] = useState<HTMLElement | null>(null);
    const attachPanel = useCallback((node: HTMLElement | null) => {
        panelRef.current = node;
        setPanel(node);
    }, []);
    const { y, backdropOpacity } = useSheetGesture({
        element: panel,
        enabled: open && isPeekMobile,
        onDismiss: onClose,
        onExpand,
    });

    return (
        <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className={`${BACKDROP_LAYER[layer]} sheet-fade fixed inset-0`}>
                    <motion.div style={{ opacity: backdropOpacity }} className="absolute inset-0 bg-twilight-void/85" />
                </DialogPrimitive.Overlay>

                <DialogPrimitive.Content
                    asChild
                    aria-describedby={undefined}
                    onOpenAutoFocus={(event) => {
                        openerRef.current = document.activeElement as HTMLElement | null;
                        focusInitial(panelRef.current, event);
                    }}
                    onCloseAutoFocus={(event) => {
                        const opener = openerRef.current;
                        if (!opener?.isConnected || opener === document.body) return;
                        event.preventDefault();
                        opener.focus({ preventScroll: true });
                    }}
                    onEscapeKeyDown={keepOwnedEscape}
                >
                    <motion.aside
                        ref={attachPanel}
                        style={sheetStyle(
                            { isPeekMobile, isMobile, keyboard, aboveKeyboard, fit, isTablet: shell.isTablet },
                            y,
                        )}
                        className={sheetClass({ isPeekMobile, isMobile, isFocus, fit, fill, layer })}
                    >
                        {isPeekMobile && (
                            <div
                                data-sheet-handle
                                className="flex h-8 shrink-0 items-center justify-center"
                                aria-hidden="true"
                            >
                                <div className="h-1 w-10 rounded-full bg-twilight-text-soft/40" />
                            </div>
                        )}

                        {showHeader && title ? (
                            <SheetHeader title={title} onClose={onClose} />
                        ) : (
                            <DialogPrimitive.Title className="sr-only">{ariaLabel}</DialogPrimitive.Title>
                        )}

                        <ToasterFocusBranch />

                        <div className={fill ? "flex min-h-0 flex-1 flex-col" : "mobile-sheet-body scrollbar-thin"}>
                            {children}
                        </div>
                    </motion.aside>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
