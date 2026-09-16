import { useMemo } from "react";
import { useSettings } from "../../../hooks/core/use-settings";
import { useBackgroundImageUrl } from "../../../hooks/ui/use-background-image";
import { GRADIENT_PRESETS } from "../../../lib/themes/gradient-presets";
import { THEME_PRESET_MAP, type ThemePresetId } from "../../../lib/themes/theme-presets";
import { buildGradientCSS } from "../../../lib/themes/background-tokens";
import { blurPixels } from "../../../lib/themes/image-palette";

/**
 * Renders a background layer behind all content.
 * - "theme" mode: renders the current preset's suggestedGradient (if any).
 * - "custom" mode: renders user-chosen solid color or gradient preset.
 * - "image" mode: renders the user's photo, blurred and dimmed to their taste,
 *   under a scrim sized by `useThemeSync` so surfaces keep their contrast.
 * Mounted once by Providers behind route content; navigation preserves the image and object URL.
 */
export function BackgroundLayer() {
    const { data: settings } = useSettings();
    const bgMode = settings?.appearance?.backgroundMode ?? "theme";
    const bgColor = settings?.appearance?.backgroundColor ?? null;
    const bgGradient = settings?.appearance?.backgroundGradient ?? null;
    const bgImage = settings?.appearance?.backgroundImage ?? null;
    const themePreset = (settings?.appearance?.themePreset ?? "default") as ThemePresetId;

    const photo = bgMode === "image" ? bgImage : null;
    const photoUrl = useBackgroundImageUrl(photo?.id);

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

        if (bgMode !== "custom") return null;

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

    if (photo) {
        const blur = blurPixels(photo.blur);
        return (
            <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
                {photoUrl && (
                    <img
                        key={photoUrl}
                        src={photoUrl}
                        alt=""
                        decoding="async"
                        className="absolute max-w-none object-cover"
                        style={{
                            // Overhang the viewport so a blurred edge still has pixels to sample.
                            inset: `-${blur * 2}px`,
                            width: `calc(100% + ${blur * 4}px)`,
                            height: `calc(100% + ${blur * 4}px)`,
                            filter: `blur(${blur}px) brightness(${photo.brightness}%)`,
                        }}
                    />
                )}
                <div className="absolute inset-0" style={{ background: "var(--bg-photo-scrim, transparent)" }} />
            </div>
        );
    }

    if (!style) return null;

    return (
        <div
            className="pointer-events-none fixed inset-0"
            style={style}
            aria-hidden="true"
        />
    );
}
