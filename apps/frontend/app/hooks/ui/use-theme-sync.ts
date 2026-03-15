import { useEffect } from "react";
import { useSettings } from "../core/use-settings";
import { setDateFormatConfig } from "../../lib/utils/date-format";

/**
 * Syncs the user's `appearance.theme` setting to the `data-theme` attribute
 * on `<html>`, which drives the CSS custom property overrides in app.css.
 *
 * - `"twilight"` → removes `data-theme` (default dark, no attribute needed)
 * - `"daylight"` → sets `data-theme="daylight"`
 * - `"system"`   → matches `prefers-color-scheme` media query
 *
 * Also syncs `appearance.motion` to `data-motion` for app-level reduced-motion.
 * Also syncs `dateTime` settings to the global date format configuration.
 */
export function useThemeSync() {
    const { data: settings } = useSettings();
    const theme = settings?.appearance?.theme ?? "twilight";
    const motion = settings?.appearance?.motion ?? "system";
    const accentIntensity = settings?.appearance?.accentIntensity ?? "balanced";
    const density = settings?.appearance?.density ?? "comfortable";
    const timeDisplay = settings?.dateTime?.timeDisplay ?? "12h";
    const dateStyle = settings?.dateTime?.dateStyle ?? "mdy";
    const weekStart = settings?.dateTime?.weekStart ?? "Monday";

    // ── Theme sync ──
    useEffect(() => {
        const root = document.documentElement;

        function apply(resolved: "twilight" | "daylight") {
            if (resolved === "daylight") {
                root.setAttribute("data-theme", "daylight");
            } else {
                root.removeAttribute("data-theme");
            }
        }

        if (theme === "system") {
            const mql = window.matchMedia("(prefers-color-scheme: light)");
            const handler = (e: MediaQueryListEvent | MediaQueryList) =>
                apply(e.matches ? "daylight" : "twilight");
            handler(mql);
            mql.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
            return () =>
                mql.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
        }

        apply(theme as "twilight" | "daylight");
    }, [theme]);

    // ── Motion sync ──
    useEffect(() => {
        const root = document.documentElement;

        if (motion === "reduced") {
            root.setAttribute("data-motion", "reduced");
        } else if (motion === "full") {
            root.setAttribute("data-motion", "full");
        } else {
            root.removeAttribute("data-motion");
        }
    }, [motion]);

    // ── Accent intensity sync ──
    useEffect(() => {
        const root = document.documentElement;
        if (accentIntensity === "balanced") {
            root.removeAttribute("data-accent");
        } else {
            root.setAttribute("data-accent", accentIntensity);
        }
    }, [accentIntensity]);

    // ── Density sync ──
    useEffect(() => {
        const root = document.documentElement;
        if (density === "comfortable") {
            root.removeAttribute("data-density");
        } else {
            root.setAttribute("data-density", density);
        }
    }, [density]);

    // ── Date/time format sync ──
    useEffect(() => {
        const weekStartMap = { Sunday: 0, Monday: 1, Saturday: 6 } as const;
        setDateFormatConfig({
            timeDisplay,
            dateStyle,
            weekStartsOn: weekStartMap[weekStart] ?? 1,
        });
    }, [timeDisplay, dateStyle, weekStart]);
}
