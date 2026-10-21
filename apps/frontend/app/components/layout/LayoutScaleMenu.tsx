import { createContext, useContext, useLayoutEffect } from "react";
import { EllipsisVertical, Minus, Plus, ZoomIn } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Tip } from "../primitives/Tooltip";
import { HEADER_ICON_BUTTON } from "./PageHeader";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { DESKTOP_LAYOUT_SCALE_DEFAULT, DESKTOP_LAYOUT_SCALES, useDesktopLayoutScale } from "../../hooks/ui/use-desktop-layout-scale";

/**
 * The desktop app's layout scale lives at the foot of every page header's ⋮ (⌘ + / − / 0 do the same).
 * A header ⋮ renders `ClaimHeaderMenu`; while none has, `MainLayout`'s header shows `HeaderScaleMenu`, a ⋮ of its own.
 */
const HeaderMenuClaim = createContext<(() => () => void) | null>(null);
export const HeaderMenuClaimProvider = HeaderMenuClaim.Provider;

/** Render beside a header ⋮ (inside `MainLayout`) so the shell doesn't add a second one. */
export function ClaimHeaderMenu() {
    const claim = useContext(HeaderMenuClaim);
    useLayoutEffect(() => claim?.(), [claim]);
    return null;
}

function useScale() {
    const { layoutScale, setLayoutScale, stepLayoutScale } = useDesktopLayoutScale();
    return {
        layoutScale,
        smaller: () => void stepLayoutScale(-1),
        larger: () => void stepLayoutScale(1),
        reset: () => void setLayoutScale(DESKTOP_LAYOUT_SCALE_DEFAULT),
        atMin: layoutScale === DESKTOP_LAYOUT_SCALES[0],
        atMax: layoutScale === DESKTOP_LAYOUT_SCALES[DESKTOP_LAYOUT_SCALES.length - 1],
    };
}

const STEP = "w-10 justify-center data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

/** The Scale row for a ⋮ `DropdownMenu`: − 100% +, each a menu item that keeps the menu open. */
export function LayoutScaleMenuRow({ separator = true }: { separator?: boolean }) {
    const scale = useScale();
    if (!IS_DESKTOP_RUNTIME) return null;
    const keepOpen = (run: () => void) => (event: Event) => { event.preventDefault(); run(); };
    return (
        <>
            {separator ? <DropdownMenu.Separator /> : null}
            <div role="group" aria-label="Layout scale" className="flex items-center gap-0.5 pl-3 pr-1">
                <ZoomIn size={14} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
                <span className="ml-2 flex-1 text-[15px] text-twilight-text-soft">Scale</span>
                <DropdownMenu.Item aria-label="Smaller" disabled={scale.atMin} onSelect={keepOpen(scale.smaller)} className={STEP}>
                    <Minus size={14} aria-hidden="true" />
                </DropdownMenu.Item>
                <DropdownMenu.Item aria-label={`Scale ${scale.layoutScale}%, reset to ${DESKTOP_LAYOUT_SCALE_DEFAULT}%`} onSelect={keepOpen(scale.reset)} className="min-w-14 justify-center text-sm tabular-nums">
                    {scale.layoutScale}%
                </DropdownMenu.Item>
                <DropdownMenu.Item aria-label="Larger" disabled={scale.atMax} onSelect={keepOpen(scale.larger)} className={STEP}>
                    <Plus size={14} aria-hidden="true" />
                </DropdownMenu.Item>
            </div>
        </>
    );
}

const PANEL_STEP = "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:pointer-events-none disabled:opacity-40";

/** The Scale section for a ⋮ that opens a panel (Schedule, Routines), headed like the panel's other sections. */
export function LayoutScalePanelRow() {
    const scale = useScale();
    if (!IS_DESKTOP_RUNTIME) return null;
    return (
        <div>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-twilight-text-muted">Scale</h4>
            <div role="group" aria-label="Layout scale" className="flex items-center justify-between rounded-xl border border-twilight-border/40 bg-white/[0.03] p-1">
                <button type="button" aria-label="Smaller" disabled={scale.atMin} onClick={scale.smaller} className={PANEL_STEP}><Minus size={14} aria-hidden="true" /></button>
                <button type="button" aria-label={`Scale ${scale.layoutScale}%, reset to ${DESKTOP_LAYOUT_SCALE_DEFAULT}%`} onClick={scale.reset} className={`${PANEL_STEP} w-auto min-w-14 px-1 text-sm tabular-nums text-twilight-text-soft`}>{scale.layoutScale}%</button>
                <button type="button" aria-label="Larger" disabled={scale.atMax} onClick={scale.larger} className={PANEL_STEP}><Plus size={14} aria-hidden="true" /></button>
            </div>
        </div>
    );
}

/** A ⋮ holding only the Scale row, for a page whose header has no ⋮ of its own. */
export function HeaderScaleMenu() {
    return (
        <DropdownMenu.Root>
            <Tip label="Options" side="bottom">
                <DropdownMenu.Trigger asChild>
                    <button type="button" aria-label="Options" className={HEADER_ICON_BUTTON}>
                        <EllipsisVertical size={18} aria-hidden="true" />
                    </button>
                </DropdownMenu.Trigger>
            </Tip>
            <DropdownMenu.Content align="end" className="min-w-[15rem]">
                <LayoutScaleMenuRow separator={false} />
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
