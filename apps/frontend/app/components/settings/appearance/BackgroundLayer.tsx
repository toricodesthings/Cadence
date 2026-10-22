import { useMemo } from "react";
import { useSettings } from "../../../hooks/core/use-settings";
import { useBackgroundImageUrl } from "../../../hooks/ui/use-background-image";
import { GRADIENT_PRESETS } from "../../../lib/themes/gradient-presets";
import { THEME_PRESET_MAP, type ThemePresetId } from "../../../lib/themes/theme-presets";
import { buildGradientCSS } from "../../../lib/themes/background-tokens";
import { blurPixels } from "../../../lib/themes/image-palette";

/** The theme's own gradient (theme mode), or the chosen gradient or colour (custom mode); null for none. */
function backgroundStyle(mode: string, color: string | null, gradient: string | null, themePreset: ThemePresetId) {
    if (mode === "theme") {
        // Render the current theme preset's default background
        const suggested = THEME_PRESET_MAP[themePreset]?.suggestedGradient;
        return suggested ? { background: buildGradientCSS(suggested.color1, suggested.color2, suggested.direction) } : null;
    }
    if (mode !== "custom") return null;
    const preset = gradient ? GRADIENT_PRESETS.find((g) => g.id === gradient) : undefined;
    if (preset) return { background: buildGradientCSS(preset.color1, preset.color2, preset.direction) };
    return color ? { background: color } : null;
}

type Appearance = NonNullable<ReturnType<typeof useSettings>["data"]>["appearance"];

/** The background the person chose, with defaults: the theme's own, no colour, no gradient, no photo. */
function backgroundChoice(appearance: Appearance | undefined) {
    const bgMode = appearance?.backgroundMode ?? "theme";
    return {
        bgMode,
        bgColor: appearance?.backgroundColor ?? null,
        bgGradient: appearance?.backgroundGradient ?? null,
        themePreset: (appearance?.themePreset ?? "default") as ThemePresetId,
        photo: bgMode === "image" ? appearance?.backgroundImage ?? null : null,
    };
}

type BackgroundPhoto = NonNullable<NonNullable<Appearance>["backgroundImage"]>;

/** The photo, blurred and dimmed, under the contrast scrim. */
function PhotoBackground({ photo, url }: { photo: BackgroundPhoto; url: string | null | undefined }) {
    const blur = blurPixels(photo.blur);
    return (
        <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
            {url && (
                <img
                    key={url}
                    src={url}
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
    const { bgMode, bgColor, bgGradient, themePreset, photo } = backgroundChoice(settings?.appearance);
    const photoUrl = useBackgroundImageUrl(photo?.id);

    const style = useMemo(
        () => backgroundStyle(bgMode, bgColor, bgGradient, themePreset),
        [bgMode, bgColor, bgGradient, themePreset],
    );

    if (photo) return <PhotoBackground photo={photo} url={photoUrl} />;

    if (!style) return null;

    return (
        <div
            className="pointer-events-none fixed inset-0"
            style={style}
            aria-hidden="true"
        />
    );
}
