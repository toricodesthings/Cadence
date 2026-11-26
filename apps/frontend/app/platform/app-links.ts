import { parseWebsite } from "@cadence/contracts/app-link";
import type { AppEntry, AppRoute } from "../lib/app-links/catalog";
import { IS_DESKTOP_RUNTIME } from "./runtime";

const SHOW_UNVERIFIED = import.meta.env.DEV || import.meta.env.VITE_SHOW_UNVERIFIED_APPS === "true";

function isIos(): boolean {
    if (typeof navigator === "undefined" || IS_DESKTOP_RUNTIME) return false;
    return (
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
}

export interface AppLaunch {
    href: string;
    opens: AppRoute["opens"];
    website: string | null;
}

const usable = (route: AppRoute | undefined): route is AppRoute =>
    Boolean(route && (route.verified || SHOW_UNVERIFIED));

export function resolveAppLaunch(entry: AppEntry): AppLaunch | null {
    const native = isIos() && usable(entry.routes.ios) ? entry.routes.ios : null;
    const website = usable(entry.routes.web) ? entry.routes.web : null;
    const primary = native ?? website;
    if (!primary) return null;
    return {
        href: primary.href,
        opens: primary.opens,
        website: primary.opens === "app" ? (website?.href ?? null) : null,
    };
}

export function resolveWebsite(stored: string | null | undefined): { href: string; label: string } | null {
    const href = stored ? parseWebsite(stored) : null;
    return href ? { href, label: new URL(href).hostname.replace(/^www\./, "") } : null;
}
