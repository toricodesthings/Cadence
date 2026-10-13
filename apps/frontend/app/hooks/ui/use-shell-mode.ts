import { useSyncExternalStore } from "react";

export type ShellMode = "wide" | "laptop" | "tablet" | "phone";

/** Touch-first devices (phones, tablets). Hybrids with a mouse or trackpad don't match. */
const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

/** No pointer info (no `matchMedia`): width alone decides, as for touch. */
export function isTouchFirst(): boolean {
    return window.matchMedia?.(TOUCH_QUERY).matches ?? true;
}

/** Width picks the layout. A mouse or trackpad keeps the desktop one down to 768px, so a tall
 * narrow monitor never gets the touch shell; tablet exists only for touch-first devices. */
export function getShellMode(width: number, touch: boolean): ShellMode {
    if (width >= 1440) return "wide";
    if (width >= 1120 || (!touch && width >= 768)) return "laptop";
    if (width >= 768) return "tablet";
    return "phone";
}

/** For code outside React (event handlers); components use `useShellMode`. */
export function currentShellMode(): ShellMode {
    return getShellMode(window.innerWidth, isTouchFirst());
}

function subscribe(listener: () => void) {
    const mq = window.matchMedia?.(TOUCH_QUERY);
    window.addEventListener("resize", listener);
    mq?.addEventListener("change", listener);
    return () => {
        window.removeEventListener("resize", listener);
        mq?.removeEventListener("change", listener);
    };
}

/** The one source of device class: layout (`mode`, from width + pointer) and input (`isTouch`).
 * Branch on these, never on raw widths or media queries in components. */
export function useShellMode() {
    const mode = useSyncExternalStore<ShellMode>(subscribe, currentShellMode, () => "wide");
    const isTouch = useSyncExternalStore(subscribe, isTouchFirst, () => false);

    return {
        mode,
        isTouch,
        isWide: mode === "wide",
        isLaptop: mode === "laptop",
        isTablet: mode === "tablet",
        isPhone: mode === "phone",
        isDesktop: mode === "wide" || mode === "laptop",
        isCompact: mode === "tablet" || mode === "phone",
    };
}
