import { set } from "idb-keyval";
import { IS_DESKTOP_RUNTIME } from "./runtime";

/** The icon badge count, in idb-keyval's default store, which sw.js also opens to add one per push. */
export const APP_BADGE_KEY = "cadence-app-badge";

/**
 * Running as the installed web app (Home Screen on iOS, an installed PWA elsewhere). `navigator.standalone`
 * is iOS's own flag, and iOS can match `fullscreen` for a `standalone` app (WebKit bug 264218).
 */
export function isInstalledApp(): boolean {
    if (typeof window === "undefined" || IS_DESKTOP_RUNTIME) return false;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
        || !!window.matchMedia?.("(display-mode: standalone), (display-mode: fullscreen)").matches;
}

type BadgingNavigator = Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/**
 * The app icon shows the bell's unread count. The count is saved too, so sw.js can add one for each
 * reminder pushed while Cadence is closed. Needs notification permission; anywhere else it does nothing.
 */
export async function syncAppBadge(count: number): Promise<void> {
    if (IS_DESKTOP_RUNTIME || typeof navigator === "undefined") return;
    const badging = navigator as BadgingNavigator;
    if (!badging.setAppBadge || !badging.clearAppBadge) return;
    try { await set(APP_BADGE_KEY, count); } catch { /* no IndexedDB: pushes start from zero */ }
    try { await (count > 0 ? badging.setAppBadge(count) : badging.clearAppBadge()); } catch { /* no notification permission */ }
}

/**
 * Asks the browser to keep the installed app's storage (offline changes, note drafts) under storage
 * pressure. A hint the browser may refuse; never asked in a tab, where Firefox would show a prompt.
 */
export async function keepAppStorage(): Promise<void> {
    if (!isInstalledApp() || !navigator.storage?.persist) return;
    try {
        if (!(await navigator.storage.persisted())) await navigator.storage.persist();
    } catch { /* the server stays the source of truth */ }
}
