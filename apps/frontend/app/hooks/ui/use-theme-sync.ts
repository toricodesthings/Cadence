import { useEffect, useMemo } from "react";
import { useSettings } from "../core/use-settings";
import { setDateFormatConfig } from "../../lib/utils/date-format";
import { useDesktopLayoutScale } from "./use-desktop-layout-scale";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { deriveCustomTokens, gradientMidpointLuminance, buildGradientCSS } from "../../lib/themes/background-tokens";
import { GRADIENT_PRESETS } from "../../lib/themes/gradient-presets";
import { THEME_PRESET_MAP, type ThemePresetId } from "../../lib/themes/theme-presets";

/**
 * Syncs appearance settings to data attributes on `<html>`, driving
 * CSS custom property overrides in app.css.
 *
 * Attributes managed:
 *   data-theme       — "daylight" | absent (twilight default)
 *   data-motion      — "reduced" | "full" | absent (system)
 *   data-accent      — "subtle" | "vivid" | absent (balanced)
 *   data-density     — "compact" | absent (comfortable)
 *   data-palette     — palette id | absent (lantern default)
 *   data-theme-preset — preset id | absent (default)
 *   data-bg-mode     — "custom" | absent (theme default)
 *
 * Also syncs `dateTime` settings to the global date format configuration.
 */
export function useThemeSync() {
    const { data: settings } = useSettings();
    const { layoutScale, scaleFactor } = useDesktopLayoutScale();
    const theme = settings?.appearance?.theme ?? "twilight";
    const motion = settings?.appearance?.motion ?? "system";
    const accentIntensity = settings?.appearance?.accentIntensity ?? "balanced";
    const density = settings?.appearance?.density ?? "comfortable";
    const palette = settings?.appearance?.palette ?? "lantern";
    const themePreset = settings?.appearance?.themePreset ?? "default";
    const backgroundMode = settings?.appearance?.backgroundMode ?? "theme";
    const backgroundColor = settings?.appearance?.backgroundColor ?? null;
    const backgroundGradient = settings?.appearance?.backgroundGradient ?? null;
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

    // ── Palette sync ──
    useEffect(() => {
        const root = document.documentElement;
        if (palette === "lantern") {
            root.removeAttribute("data-palette");
        } else {
            root.setAttribute("data-palette", palette);
        }
    }, [palette]);

    // ── Theme preset sync ──
    useEffect(() => {
        const root = document.documentElement;
        if (themePreset === "default" || themePreset === "daylight-default") {
            root.removeAttribute("data-theme-preset");
        } else {
            root.setAttribute("data-theme-preset", themePreset);
        }
    }, [themePreset]);

    // ── Custom background sync ──
    const customBgTokens = useMemo(() => {
        if (backgroundMode === "theme") {
            // For theme mode, derive tokens from the preset's suggested gradient
            const preset = THEME_PRESET_MAP[themePreset as ThemePresetId];
            if (preset?.suggestedGradient) {
                const { color1, color2, direction } = preset.suggestedGradient;
                const midLum = gradientMidpointLuminance(color1, color2);
                const baseHex = midLum > 0.18 ? "#f5f5f5" : "#1a1a2e";
                return { ...deriveCustomTokens(baseHex), __gradient: buildGradientCSS(color1, color2, direction) };
            }
            return null;
        }

        // Custom mode
        if (backgroundColor) {
            return deriveCustomTokens(backgroundColor);
        }
        if (backgroundGradient) {
            const preset = GRADIENT_PRESETS.find((g) => g.id === backgroundGradient);
            if (preset) {
                const midLum = gradientMidpointLuminance(preset.color1, preset.color2);
                const baseHex = midLum > 0.18 ? "#f5f5f5" : "#1a1a2e";
                return { ...deriveCustomTokens(baseHex), __gradient: buildGradientCSS(preset.color1, preset.color2, preset.direction) };
            }
        }
        return null;
    }, [backgroundMode, backgroundColor, backgroundGradient, themePreset]);

    useEffect(() => {
        const root = document.documentElement;
        if (!customBgTokens) {
            root.removeAttribute("data-bg-mode");
            // Clean up any inline custom bg tokens
            const style = root.style;
            for (let i = style.length - 1; i >= 0; i--) {
                const prop = style[i];
                if (prop.startsWith("--color-bg-")) {
                    style.removeProperty(prop);
                }
            }
            style.removeProperty("--bg-gradient");
            return;
        }

        root.setAttribute("data-bg-mode", "custom");
        for (const [key, value] of Object.entries(customBgTokens)) {
            if (key === "__gradient") {
                root.style.setProperty("--bg-gradient", value);
            } else {
                root.style.setProperty(key, value);
            }
        }
    }, [customBgTokens]);

    useEffect(() => {
        const root = document.documentElement;

        if (!IS_DESKTOP_RUNTIME || layoutScale === "default") {
            root.style.removeProperty("font-size");
            root.style.removeProperty("--desktop-layout-scale");
            return;
        }

        root.style.setProperty("font-size", `${16 * scaleFactor}px`);
        root.style.setProperty("--desktop-layout-scale", scaleFactor.toFixed(2));
    }, [layoutScale, scaleFactor]);

    // ── Persist appearance cache for blocking script (prevents FOUC) ──
    useEffect(() => {
        try {
            localStorage.setItem("cadence-appearance", JSON.stringify({
                theme, palette, themePreset, backgroundMode,
            }));
        } catch { /* quota exceeded — non-critical */ }
    }, [theme, palette, themePreset, backgroundMode]);

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
