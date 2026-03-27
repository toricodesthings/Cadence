import { useMemo } from "react";
import { useSettings } from "../../../hooks/core/use-settings";
import { GRADIENT_PRESETS } from "../../../lib/themes/gradient-presets";
import { THEME_PRESET_MAP, type ThemePresetId } from "../../../lib/themes/theme-presets";
import { buildGradientCSS } from "../../../lib/themes/background-tokens";

/**
 * Renders a background layer behind all content.
 * - "theme" mode: renders the current preset's suggestedGradient (if any).
 * - "custom" mode: renders user-chosen solid color or gradient preset.
 * Placed as a fixed positioned element at z-0 behind the app shell.
 */
export function BackgroundLayer() {
    const { data: settings } = useSettings();
    const bgMode = settings?.appearance?.backgroundMode ?? "theme";
    const bgColor = settings?.appearance?.backgroundColor ?? null;
    const bgGradient = settings?.appearance?.backgroundGradient ?? null;
    const themePreset = (settings?.appearance?.themePreset ?? "default") as ThemePresetId;

    const style = useMemo(() => {
        if (bgMode === "theme") {
            // Render the current theme preset's default background
            const preset = THEME_PRESET_MAP[themePreset];
            if (preset?.suggestedGradient) {
                const { color1, color2, direction } = preset.suggestedGradient;
                return { background: buildGradientCSS(color1, color2, direction) };
            }
            return null;
        }

        // Custom mode
        if (bgGradient) {
            const preset = GRADIENT_PRESETS.find((g) => g.id === bgGradient);
            if (preset) {
                return { background: buildGradientCSS(preset.color1, preset.color2, preset.direction) };
            }
        }

        if (bgColor) {
            return { background: bgColor };
        }

        return null;
    }, [bgMode, bgColor, bgGradient, themePreset]);

    if (!style) return null;

    return (
        <div
            className="pointer-events-none fixed inset-0 -z-10 transition-[background] duration-500"
            style={style}
            aria-hidden="true"
        />
    );
}
