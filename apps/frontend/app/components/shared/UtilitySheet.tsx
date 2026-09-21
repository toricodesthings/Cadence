import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { ResponsiveOverlayPanel } from "./ResponsiveOverlayPanel";
import { Tip } from "../primitives/Tooltip";

/**
 * The one compact sheet layout: drag handle + backdrop + focus trap come from
 * `ResponsiveOverlayPanel`, and this adds the header, an optional band under it,
 * the scroll region and a pinned footer. Every mobile panel goes through here so
 * headings, close affordances and spacing stay identical (§4.5).
 */
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
}: {
    title: string;
    /** Secondary line under the heading. */
    subtitle?: ReactNode;
    /** Replaces the heading row content — used by search, which needs an input there. */
    header?: ReactNode;
    /** Sits between the header and the scroll region, e.g. a segmented chooser. */
    band?: ReactNode;
    /** Pinned under the scroll region, e.g. Cancel / submit. */
    footer?: ReactNode;
    open: boolean;
    onClose: () => void;
    onBack?: () => void;
    backLabel?: string;
    children: ReactNode;
    scrollable?: boolean;
    /** Drops the body padding and width cap for children that own their own layout. */
    flush?: boolean;
    mode?: "peek" | "focus";
}) {
    const scroll = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (scroll.current) scroll.current.scrollTop = 0;
        if (open && !header) heading.current?.focus({ preventScroll: true });
    }, [title, open, header]);

    return <ResponsiveOverlayPanel open={open} onClose={onClose} ariaLabel={title} mode={mode} fill>
        <header className={`utility-sheet-header shrink-0 px-4 pb-3 ${band || footer || header ? "border-b border-twilight-border" : ""}`}>
            <div className="flex min-h-14 items-center gap-2">
                {onBack && <Tip label={backLabel}><button type="button" className="mobile-icon-button" aria-label={backLabel} onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /></button></Tip>}
                {header ?? (
                    <div className="min-w-0 flex-1">
                        <h2 ref={heading} data-sheet-heading tabIndex={-1} className="truncate font-display text-xl font-semibold text-twilight-text">{title}</h2>
                        {subtitle ? <p className="mt-0.5 truncate text-sm text-twilight-text-soft">{subtitle}</p> : null}
                    </div>
                )}
                <Tip label="Close"><button type="button" className="mobile-icon-button shrink-0 rounded-full bg-twilight-surface/70" aria-label={`Close ${title}`} onClick={onClose}><X size={20} aria-hidden="true" /></button></Tip>
            </div>
        </header>

        {band}

        <div ref={scroll} className={`utility-sheet-content min-h-0 flex-1 ${flush ? "" : "px-4 pb-6"} ${scrollable ? "overflow-y-auto overscroll-contain" : "flex flex-col overflow-hidden"}`}>
            {flush ? children : <div className={`mx-auto w-full max-w-3xl ${scrollable ? "space-y-5" : "flex min-h-0 flex-1 flex-col"}`}>{children}</div>}
        </div>

        {footer ? <div className="shrink-0">{footer}</div> : null}
    </ResponsiveOverlayPanel>;
}
