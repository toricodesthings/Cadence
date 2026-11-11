import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronLeft, X } from "lucide-react";
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
    fit = false,
    layer,
    confirm,
    center,
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
    /** Short sheets: height follows the content instead of the tall default. */
    fit?: boolean;
    layer?: "route" | "room";
    /** The sheet's one primary action: a ✓ at the header's right, opposite the X (no bottom Cancel/submit). */
    confirm?: { label: string; onConfirm: () => void; disabled?: boolean };
    /** Takes the heading's place between X and ✓, e.g. a type switcher (the heading stays for screen readers). */
    center?: ReactNode;
}) {
    const scroll = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (scroll.current) scroll.current.scrollTop = 0;
        if (open && !header) (scroll.current?.querySelector<HTMLElement>("[data-initial-focus]") ?? heading.current)?.focus({ preventScroll: true });
    }, [title, open, header]);

    // X leads (the back chevron takes its place when there is one); the ✓, if any, sits opposite.
    const closeButton = <Tip label="Close"><button type="button" className="mobile-icon-button shrink-0 rounded-full bg-twilight-surface/70" aria-label={`Close ${title}`} onClick={onClose}><X size={20} aria-hidden="true" /></button></Tip>;

    return <ResponsiveOverlayPanel open={open} onClose={onClose} ariaLabel={title} mode={mode} fill fit={fit} layer={layer}>
        <header className={`utility-sheet-header shrink-0 px-4 pb-3 ${band || footer || header ? "border-b border-twilight-border" : ""}`}>
            <div className="flex min-h-14 items-center gap-2">
                {onBack
                    ? <Tip label={backLabel}><button type="button" className="mobile-icon-button" aria-label={backLabel} onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /></button></Tip>
                    : closeButton}
                {header ?? (
                    // The heading sits centred between the header's controls, the way iOS does.
                    <div className="min-w-0 flex-1 text-center">
                        <h2 ref={heading} data-sheet-heading tabIndex={-1} className={center ? "sr-only" : "truncate font-display text-xl font-semibold text-twilight-text"}>{title}</h2>
                        {center ?? (subtitle ? <p className="mt-0.5 truncate text-sm text-twilight-text-soft">{subtitle}</p> : null)}
                    </div>
                )}
                {onBack ? closeButton : null}
                {/* X alone: an empty twin on the right keeps the heading truly centred. */}
                {!onBack && !confirm && !header ? <span aria-hidden="true" className="size-11 shrink-0" /> : null}
                {confirm ? (
                    <Tip label={confirm.label}>
                        {/* Keeps focus in the field, like the footer: a blur would drop the keyboard mid-tap. */}
                        <button type="button" className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full accent-fill disabled:cursor-not-allowed disabled:opacity-40" aria-label={confirm.label} disabled={confirm.disabled} onMouseDown={(e) => e.preventDefault()} onClick={confirm.onConfirm}>
                            <Check size={20} aria-hidden="true" />
                        </button>
                    </Tip>
                ) : null}
            </div>
        </header>

        {band}

        <div ref={scroll} className={`utility-sheet-content min-h-0 flex-1 ${flush ? "" : "px-4 pb-6"} ${scrollable ? "overflow-y-auto overscroll-contain" : "flex flex-col overflow-hidden"}`}>
            {flush ? children : <div className={`mx-auto w-full max-w-3xl ${scrollable ? "space-y-5" : "flex min-h-0 flex-1 flex-col"}`}>{children}</div>}
        </div>

        {/* A footer button keeps focus in the field: a blur would close the keyboard and move the footer
            out from under the finger before the tap lands. */}
        {footer ? <div className="shrink-0" onMouseDown={(e) => { if ((e.target as Element).closest("button")) e.preventDefault(); }}>{footer}</div> : null}
    </ResponsiveOverlayPanel>;
}
