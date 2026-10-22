import { createContext, useContext, useLayoutEffect } from "react";
import { EllipsisVertical, Minus, Plus, ZoomIn } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Tip } from "../primitives/Tooltip";
import { HEADER_ICON_BUTTON } from "./PageHeader";
import { MENU_HOVER, MENU_ITEM, MENU_SEPARATOR } from "../primitives/menu-styles";
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
/** A panel's step looks exactly like a menu item (`DropdownMenu.Item`'s default row). */
const PANEL_STEP = `${MENU_ITEM} ${MENU_HOVER} cursor-pointer text-twilight-text-soft hover:text-accent-primary focus:text-accent-primary disabled:pointer-events-none disabled:opacity-40`;

/**
 * The Scale row: − 100% +, the percentage resets. In a ⋮ `DropdownMenu` each step is a menu item that keeps the menu
 * open; in a ⋮ panel (`panel`, Schedule) the same row is drawn with buttons, so the two look identical.
 */
export function LayoutScaleMenuRow({ separator = true, panel = false }: { separator?: boolean; panel?: boolean }) {
    const scale = useScale();
    if (!IS_DESKTOP_RUNTIME) return null;
    const steps = [
        { id: "smaller", label: "Smaller", disabled: scale.atMin, run: scale.smaller, body: <Minus size={14} aria-hidden="true" />, className: STEP },
        { id: "reset", label: `Scale ${scale.layoutScale}%, reset to ${DESKTOP_LAYOUT_SCALE_DEFAULT}%`, disabled: false, run: scale.reset, body: `${scale.layoutScale}%`, className: "min-w-14 justify-center text-sm tabular-nums" },
        { id: "larger", label: "Larger", disabled: scale.atMax, run: scale.larger, body: <Plus size={14} aria-hidden="true" />, className: STEP },
    ];
    return (
        <div className={panel ? "-mx-2" : undefined}>
            {separator ? <div role="separator" className={MENU_SEPARATOR} /> : null}
            <div role="group" aria-label="Layout scale" className="flex items-center gap-0.5 pl-3 pr-1">
                <ZoomIn size={14} className="shrink-0 text-twilight-text-soft" aria-hidden="true" />
                <span className="ml-2 flex-1 text-[15px] text-twilight-text-soft">Scale</span>
                {steps.map((step) => panel ? (
                    <button key={step.id} type="button" aria-label={step.label} disabled={step.disabled} onClick={step.run} className={`${PANEL_STEP} ${step.className}`}>{step.body}</button>
                ) : (
                    <DropdownMenu.Item key={step.id} aria-label={step.label} disabled={step.disabled} className={step.className}
                        onSelect={(event) => { event.preventDefault(); step.run(); }}>
                        {step.body}
                    </DropdownMenu.Item>
                ))}
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
