import { useEffect, useMemo } from "react";
import { useSettings } from "../core/use-settings";
import { setDateFormatConfig, WEEK_START_INDEX } from "../../lib/utils/date-format";
import { useDesktopLayoutScale } from "./use-desktop-layout-scale";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { syncNativeWindowTheme } from "../../platform/desktop-shell";
import { deriveCustomTokens, buildGradientCSS, gradientBaseHex } from "../../lib/themes/background-tokens";
import { autoAccent, derivePhotoAccentTokens, derivePhotoTone } from "../../lib/themes/image-palette";
import { GRADIENT_PRESETS } from "../../lib/themes/gradient-presets";
import { THEME_PRESET_MAP, type ThemePresetId } from "../../lib/themes/theme-presets";
import { resolveLoadingSeason } from "../../lib/themes/season";

/** Set an attribute on `<html>`, or remove it when the value is null (its default). */
function useRootAttribute(name: string, value: string | null) {
    useEffect(() => {
        if (value === null) document.documentElement.removeAttribute(name);
        else document.documentElement.setAttribute(name, value);
    }, [name, value]);
}

/** Background tokens for a photo, a theme preset's suggested gradient, or a custom colour or gradient; null = the theme's own. */
function customBackgroundTokens(
    photoBase: string | null,
    backgroundMode: string,
    backgroundColor: string | null,
    backgroundGradient: string | null,
    themePreset: string,
): Record<string, string> | null {
    if (photoBase) return deriveCustomTokens(photoBase);
    if (backgroundMode !== "theme" && backgroundColor) return deriveCustomTokens(backgroundColor);
    const gradient = backgroundMode === "theme"
        ? THEME_PRESET_MAP[themePreset as ThemePresetId]?.suggestedGradient
        : GRADIENT_PRESETS.find((g) => g.id === backgroundGradient);
    if (!gradient) return null;
    const { color1, color2, direction } = gradient;
    return { ...deriveCustomTokens(gradientBaseHex(color1, color2)), __gradient: buildGradientCSS(color1, color2, direction) };
}

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
 *   data-bg-mode     — "custom" | absent (theme default); a photo uses "custom" too
 *   data-bg-image    — "on" while a photo background is applied
 *   data-loading-season / data-loading-mode — loading scene variant (also set by the head boot script)
 *
 * Also syncs `dateTime` settings to the global date format configuration.
 */
export function useThemeSync() {
    const { data: settings } = useSettings();
    const { layoutScale, scaleFactor } = useDesktopLayoutScale();
    const {
        theme = "twilight",
        motion = "system",
        accentIntensity = "balanced",
        density = "comfortable",
        palette = "lantern",
        themePreset = "default",
        loadingSeason = "auto",
        backgroundMode = "theme",
        backgroundColor = null,
        backgroundGradient = null,
        backgroundImage = null,
    } = settings?.appearance ?? {};
    const { timeDisplay = "12h", dateStyle = "mdy", weekStart = "Monday" } = settings?.dateTime ?? {};

    // ── Photo background ──
    // A photo decides its own light/dark and accents: the interface has to read
    // against the picture the user actually sees, not the theme they last picked.
    const photo = useMemo(() => {
        if (backgroundMode !== "image" || !backgroundImage) return null;
        const tone = derivePhotoTone(backgroundImage.dominant, backgroundImage.brightness);
        const accent = backgroundImage.accent ?? autoAccent(backgroundImage.swatches, tone.base);
        return { tone, accentTokens: derivePhotoAccentTokens(accent, backgroundImage.swatches, tone) };
    }, [backgroundMode, backgroundImage]);

    const effectiveTheme = photo ? (photo.tone.isDark ? "twilight" : "daylight") : theme;

    // ── Theme sync ──
    useEffect(() => {
        const root = document.documentElement;

        function apply(resolved: "twilight" | "daylight") {
            if (resolved === "daylight") {
                root.setAttribute("data-theme", "daylight");
            } else {
                root.removeAttribute("data-theme");
            }
            root.setAttribute("data-loading-mode", resolved);
        }

        if (effectiveTheme === "system") {
            const mql = window.matchMedia("(prefers-color-scheme: light)");
            const handler = (e: MediaQueryListEvent | MediaQueryList) =>
                apply(e.matches ? "daylight" : "twilight");
            handler(mql);
            mql.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
            return () =>
                mql.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
        }

        apply(effectiveTheme as "twilight" | "daylight");
    }, [effectiveTheme]);

    // ── Native frame sync (desktop only; "system" follows Windows) ──
    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) return;
        void syncNativeWindowTheme(effectiveTheme === "daylight" ? "daylight" : effectiveTheme === "system" ? "system" : "twilight");
    }, [effectiveTheme]);

    // ── Attributes, absent at their defaults ──
    useRootAttribute("data-motion", motion === "system" ? null : motion);
    useRootAttribute("data-accent", accentIntensity === "balanced" ? null : accentIntensity);
    useRootAttribute("data-density", density === "comfortable" ? null : density);
    useRootAttribute("data-palette", palette === "lantern" ? null : palette);
    useRootAttribute("data-theme-preset", themePreset === "default" || themePreset === "daylight-default" ? null : themePreset);

    // ── Loading scene season (its own setting, never the theme) ──
    useEffect(() => {
        document.documentElement.setAttribute("data-loading-season", resolveLoadingSeason(loadingSeason));
    }, [loadingSeason]);

    // ── Custom background sync ──
    const customBgTokens = useMemo(
        () => customBackgroundTokens(photo?.tone.base ?? null, backgroundMode, backgroundColor, backgroundGradient, themePreset),
        [photo, backgroundMode, backgroundColor, backgroundGradient, themePreset],
    );

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
        root.style.removeProperty("--bg-gradient");
        for (const [key, value] of Object.entries(customBgTokens)) {
            if (key === "__gradient") {
                root.style.setProperty("--bg-gradient", value);
            } else {
                root.style.setProperty(key, value);
            }
        }
    }, [customBgTokens]);

    // ── Photo accent sync ──
    // Inline properties beat the [data-palette] rules, so the photo's accents
    // win while it is applied and hand back cleanly when it isn't.
    useEffect(() => {
        const root = document.documentElement;
        const style = root.style;

        if (!photo) {
            root.removeAttribute("data-bg-image");
            for (let i = style.length - 1; i >= 0; i -= 1) {
                const prop = style[i];
                if (prop.startsWith("--accent-")) style.removeProperty(prop);
            }
            style.removeProperty("--bg-photo-scrim");
            return;
        }

        root.setAttribute("data-bg-image", "on");
        for (const [key, value] of Object.entries(photo.accentTokens)) style.setProperty(key, value);
        style.setProperty("--bg-photo-scrim", photo.tone.scrim);
    }, [photo]);

    useEffect(() => {
        const root = document.documentElement;

        if (!IS_DESKTOP_RUNTIME || layoutScale === 100) {
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
                theme: effectiveTheme, palette, themePreset, backgroundMode, motion, loadingSeason,
            }));
        } catch { /* quota exceeded — non-critical */ }
    }, [effectiveTheme, palette, themePreset, backgroundMode, motion, loadingSeason]);

    // ── Date/time format sync ──
    useEffect(() => {
        setDateFormatConfig({
            timeDisplay,
            dateStyle,
            weekStartsOn: WEEK_START_INDEX[weekStart] ?? 1,
        });
    }, [timeDisplay, dateStyle, weekStart]);
}
