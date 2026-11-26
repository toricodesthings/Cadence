import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronLeft, X } from "lucide-react";
import { ResponsiveOverlayPanel } from "./ResponsiveOverlayPanel";
import { Tip } from "../primitives/Tooltip";

export function UtilitySheet({
    title,
    subtitle,
    header,
    band,
    footer,
    open,
    onClose,
    onBack,
    backLabel = "Back to settings",
    children,
    scrollable = true,
    flush = false,
    mode = "peek",
    fit = false,
    layer,
    confirm,
    center,
}: {
    title: string;
    subtitle?: ReactNode;
    header?: ReactNode;
    band?: ReactNode;
    footer?: ReactNode;
    open: boolean;
    onClose: () => void;
    onBack?: () => void;
    backLabel?: string;
    children: ReactNode;
    scrollable?: boolean;
    flush?: boolean;
    mode?: "peek" | "focus";
    fit?: boolean;
    layer?: "route" | "room";
    confirm?: { label: string; onConfirm: () => void; disabled?: boolean };
    center?: ReactNode;
}) {
    const scroll = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (scroll.current) scroll.current.scrollTop = 0;
        if (open && !header)
            (scroll.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? heading.current)?.focus({
                preventScroll: true,
            });
    }, [title, open, header]);

    const closeButton = (
        <Tip label="Close">
            <button
                type="button"
                className="mobile-icon-button shrink-0 rounded-full bg-twilight-surface/70"
                aria-label={`Close ${title}`}
                onClick={onClose}
            >
                <X size={20} aria-hidden="true" />
            </button>
        </Tip>
    );

    return (
        <ResponsiveOverlayPanel
            open={open}
            onClose={onClose}
            ariaLabel={title}
            mode={mode}
            fill
            fit={fit}
            layer={layer}
        >
            <header
                className={`utility-sheet-header shrink-0 px-4 pb-3 ${band || footer || header ? "border-b border-twilight-border" : ""}`}
            >
                <div className="flex min-h-14 items-center gap-2">
                    {onBack ? (
                        <Tip label={backLabel}>
                            <button
                                type="button"
                                className="mobile-icon-button"
                                aria-label={backLabel}
                                onClick={onBack}
                            >
                                <ChevronLeft size={22} aria-hidden="true" />
                            </button>
                        </Tip>
                    ) : (
                        closeButton
                    )}
                    {header ?? (
                        <div className="min-w-0 flex-1 text-center">
                            <h2
                                ref={heading}
                                data-sheet-heading
                                tabIndex={-1}
                                className={
                                    center
                                        ? "sr-only"
                                        : "truncate font-display text-xl font-semibold text-twilight-text"
                                }
                            >
                                {title}
                            </h2>
                            {center ??
                                (subtitle ? (
                                    <p className="mt-0.5 truncate text-sm text-twilight-text-soft">{subtitle}</p>
                                ) : null)}
                        </div>
                    )}
                    {onBack ? closeButton : null}
                    {!onBack && !confirm && !header ? <span aria-hidden="true" className="size-11 shrink-0" /> : null}
                    {confirm ? (
                        <Tip label={confirm.label}>
                            <button
                                type="button"
                                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={confirm.label}
                                disabled={confirm.disabled}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={confirm.onConfirm}
                            >
                                <Check size={20} aria-hidden="true" />
                            </button>
                        </Tip>
                    ) : null}
                </div>
            </header>

            {band}

            <div
                ref={scroll}
                className={`utility-sheet-content min-h-0 flex-1 ${flush ? "" : "px-4 pb-6"} ${scrollable ? "overflow-y-auto overscroll-contain" : "flex flex-col overflow-hidden"}`}
            >
                {flush ? (
                    children
                ) : (
                    <div
                        className={`mx-auto w-full max-w-3xl ${scrollable ? "space-y-5" : "flex min-h-0 flex-1 flex-col"}`}
                    >
                        {children}
                    </div>
                )}
            </div>

            {footer ? (
                // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- pointer convenience; keyboard path is on the inner controls
                <div
                    className="shrink-0"
                    onMouseDown={(e) => {
                        if ((e.target as Element).closest("button")) e.preventDefault();
                    }}
                >
                    {footer}
                </div>
            ) : null}
        </ResponsiveOverlayPanel>
    );
}
