import type { AppEntry, AppRoute } from "../lib/app-links/catalog";
import { IS_DESKTOP_RUNTIME } from "./runtime";

/** Dev builds and `VITE_SHOW_UNVERIFIED_APPS=true` previews list candidate routes so they can be tried on a device. */
const SHOW_UNVERIFIED = import.meta.env.DEV || import.meta.env.VITE_SHOW_UNVERIFIED_APPS === "true";

/** iPhone, iPad and iPadOS in desktop-site mode (which reports a Mac with a touch screen). */
function isIos(): boolean {
    if (typeof navigator === "undefined" || IS_DESKTOP_RUNTIME) return false;
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export interface AppLaunch {
    href: string;
    opens: AppRoute["opens"];
    /** The website, offered by hand beneath a native route; never tried automatically. */
    website: string | null;
}

const usable = (route: AppRoute | undefined): route is AppRoute => Boolean(route && (route.verified || SHOW_UNVERIFIED));

/**
 * Where this device sends a tap for the entry, decided before the tap so the link can be a plain anchor.
 * Null: nothing verified for this platform (the saved choice stays; the picker leaves the app out).
 */
export function resolveAppLaunch(entry: AppEntry): AppLaunch | null {
    const native = isIos() && usable(entry.routes.ios) ? entry.routes.ios : null;
    const website = usable(entry.routes.web) ? entry.routes.web : null;
    const primary = native ?? website;
    if (!primary) return null;
    return { href: primary.href, opens: primary.opens, website: primary.opens === "app" ? website?.href ?? null : null };
}
