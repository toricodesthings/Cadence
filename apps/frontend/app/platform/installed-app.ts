import { set } from "idb-keyval";
import { IS_DESKTOP_RUNTIME } from "./runtime";

export const APP_BADGE_KEY = "cadence-app-badge";

export function isInstalledApp(): boolean {
    if (typeof window === "undefined" || IS_DESKTOP_RUNTIME) return false;
    return (
        (navigator as Navigator & { standalone?: boolean }).standalone === true ||
        !!window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)").matches
    );
}

type BadgingNavigator = Navigator & {
    setAppBadge?: (count?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
};

export async function syncAppBadge(count: number): Promise<void> {
    if (IS_DESKTOP_RUNTIME || typeof navigator === "undefined") return;
    const badging = navigator as BadgingNavigator;
    if (!badging.setAppBadge || !badging.clearAppBadge) return;
    try {
        await set(APP_BADGE_KEY, count);
    } catch {}
    try {
        await (count > 0 ? badging.setAppBadge(count) : badging.clearAppBadge());
    } catch {}
}

export async function keepAppStorage(): Promise<void> {
    if (!isInstalledApp() || !navigator.storage?.persist) return;
    try {
        if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch {}
}
