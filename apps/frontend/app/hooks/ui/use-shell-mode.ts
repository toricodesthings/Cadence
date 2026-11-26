import { useSyncExternalStore } from "react";

export type ShellMode = "wide" | "laptop" | "tablet" | "phone";

const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

export function isTouchFirst(): boolean {
    return window.matchMedia?.(TOUCH_QUERY).matches ?? true;
}

export function getShellMode(width: number, touch: boolean): ShellMode {
    if (width >= 1440) return "wide";
    if (width >= 1120 || (!touch && width >= 768)) return "laptop";
    if (width >= 768) return "tablet";
    return "phone";
}

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
