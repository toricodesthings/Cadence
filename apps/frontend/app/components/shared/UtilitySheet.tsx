import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { ResponsiveOverlayPanel } from "./ResponsiveOverlayPanel";
import { Tip } from "../primitives/Tooltip";

export function UtilitySheet({ title, open, onClose, onBack, children, scrollable = true }: {
    title: string; open: boolean; onClose: () => void; onBack?: () => void; children: ReactNode; scrollable?: boolean;
}) {
    const scroll = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (scroll.current) scroll.current.scrollTop = 0;
        if (open) heading.current?.focus({ preventScroll: true });
    }, [title, open]);

    return <ResponsiveOverlayPanel open={open} onClose={onClose} ariaLabel={title} fill>
        <header className="utility-sheet-header flex min-h-14 shrink-0 items-center gap-2 px-4 pb-3">
            {onBack && <Tip label="Back to settings"><button type="button" className="mobile-icon-button" aria-label="Back to settings" onClick={onBack}><ChevronLeft size={22} aria-hidden="true" /></button></Tip>}
            <h2 ref={heading} data-sheet-heading tabIndex={-1} className="min-w-0 flex-1 font-display text-xl font-semibold text-twilight-text">{title}</h2>
            <Tip label="Close"><button type="button" className="mobile-icon-button rounded-full bg-twilight-surface/70" aria-label={`Close ${title}`} onClick={onClose}><X size={20} aria-hidden="true" /></button></Tip>
        </header>
        <div ref={scroll} className={`utility-sheet-content min-h-0 flex-1 px-4 pb-6 ${scrollable ? "overflow-y-auto overscroll-contain" : "flex flex-col overflow-hidden"}`}>
            <div className={`mx-auto w-full max-w-3xl ${scrollable ? "space-y-5" : "flex min-h-0 flex-1 flex-col"}`}>{children}</div>
        </div>
    </ResponsiveOverlayPanel>;
}
