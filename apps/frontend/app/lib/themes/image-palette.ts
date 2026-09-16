/**
 * Colour reading for photo backgrounds.
 *
 * Everything here is pure: the caller samples the photo into RGBA pixels
 * (`readImagePixels`) and these functions turn them into an average tone, a set
 * of accent candidates, and the CSS custom properties the app themes itself
 * with. Contrast is enforced against the surface the accent will actually sit
 * on, so a photo can never push the interface below the readable floor.
 */

import { hexToRgb, relativeLuminance, rgbToHex } from "./background-tokens";

export interface PhotoPalette {
    /** Average tone of the photo; surfaces and text tokens derive from it. */
    dominant: string;
    /** Accent candidates, most useful first. */
    swatches: string[];
}

/** Luminance below which we treat the interface as dark-on-light-photo. */
const DARK_SURFACE_MAX_LUMINANCE = 0.22;
/** Contrast an accent must reach against the surface behind it. */
const MIN_ACCENT_CONTRAST = 4.5;
/** Blur, in pixels, at 100 %. */
const MAX_BLUR_PX = 40;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function contrastRatio(a: string, b: string): number {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
}

// ── HSL conversion ──

export function hexToHsl(hex: string): [number, number, number] {
    const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;

    if (delta === 0) return [0, 0, lightness];

    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    const hue = max === r
        ? ((g - b) / delta + (g < b ? 6 : 0))
        : max === g
            ? (b - r) / delta + 2
            : (r - g) / delta + 4;

    return [hue * 60, saturation, lightness];
}

export function hslToHex(hue: number, saturation: number, lightness: number): string {
    const h = ((hue % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lightness - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0]
        : h < 120 ? [x, c, 0]
            : h < 180 ? [0, c, x]
                : h < 240 ? [0, x, c]
                    : h < 300 ? [x, 0, c]
                        : [c, 0, x];
    return rgbToHex([(r + m) * 255, (g + m) * 255, (b + m) * 255]);
}

function withAlpha(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Reading a photo ──

/**
 * Reduce RGBA pixels to an average tone plus accent candidates.
 *
 * Candidates are binned in a coarse RGB grid, scored on how colourful and how
 * common they are, and thinned so no two share a hue. A photo with no colour of
 * its own (snow, fog, black and white) still yields one candidate, tinted from
 * its own average, so callers always have something to offer.
 */
export function extractPhotoPalette(pixels: Uint8ClampedArray, maxSwatches = 6): PhotoPalette {
    const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
    let totals = { count: 0, r: 0, g: 0, b: 0 };

    for (let i = 0; i < pixels.length; i += 4) {
        const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
        if (a < 128) continue;

        totals = { count: totals.count + 1, r: totals.r + r, g: totals.g + g, b: totals.b + b };

        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
        bins.set(key, { count: bin.count + 1, r: bin.r + r, g: bin.g + g, b: bin.b + b });
    }

    if (totals.count === 0) return { dominant: "#1a1a2e", swatches: ["#e8a44a"] };

    const dominant = rgbToHex([totals.r / totals.count, totals.g / totals.count, totals.b / totals.count]);

    const scored = [...bins.values()]
        .map((bin) => {
            const hex = rgbToHex([bin.r / bin.count, bin.g / bin.count, bin.b / bin.count]);
            const [hue, saturation, lightness] = hexToHsl(hex);
            // Favour colour that a person would call colourful, in the middle of
            // the lightness range; frequency is a tiebreaker, not the driver.
            const colourfulness = Math.min(saturation / 0.45, 1);
            const usableLightness = 1 - Math.abs(lightness - 0.55) / 0.55;
            const frequency = Math.sqrt(bin.count / totals.count);
            return { hex, hue, score: colourfulness * Math.max(usableLightness, 0) * (0.35 + 0.65 * frequency) };
        })
        .filter((candidate) => candidate.score > 0.02)
        .sort((a, b) => b.score - a.score);

    const swatches: string[] = [];
    const hues: number[] = [];
    for (const candidate of scored) {
        if (swatches.length >= maxSwatches) break;
        const tooClose = hues.some((hue) => {
            const distance = Math.abs(hue - candidate.hue);
            return Math.min(distance, 360 - distance) < 25;
        });
        if (tooClose) continue;
        swatches.push(candidate.hex);
        hues.push(candidate.hue);
    }

    if (swatches.length === 0) {
        // A colourless photo: lift its own average into something usable.
        const [hue, saturation] = hexToHsl(dominant);
        swatches.push(hslToHex(hue, Math.max(saturation, 0.35), 0.6));
    }

    return { dominant, swatches };
}

// ── Turning colours into tokens ──

export interface PhotoTone {
    /** Base colour the interface surfaces derive from. */
    base: string;
    /** Whether the interface runs dark (light text) over this photo. */
    isDark: boolean;
    /** Veil drawn over the photo so surfaces and text keep their contrast. */
    scrim: string;
}

/**
 * Decide how the interface sits on a photo: which way round the text runs, the
 * surface colour it derives from, and the veil that guarantees both. Brightness
 * is applied first, because the user's own setting is what they actually see.
 */
export function derivePhotoTone(dominant: string, brightness: number): PhotoTone {
    const scale = clamp(brightness, 20, 120) / 100;
    const lit = rgbToHex(hexToRgb(dominant).map((channel) => channel * scale) as [number, number, number]);
    const isDark = relativeLuminance(lit) <= DARK_SURFACE_MAX_LUMINANCE;
    const [hue, saturation, lightness] = hexToHsl(lit);

    // Push the surface tone well clear of the midtones so text never lands in
    // the unreadable middle, keeping the photo's hue.
    const base = isDark
        ? hslToHex(hue, Math.min(saturation, 0.5), Math.min(lightness, 0.1))
        : hslToHex(hue, Math.min(saturation, 0.35), Math.max(lightness, 0.92));

    return {
        base,
        isDark,
        scrim: isDark ? withAlpha(base, 0.62) : withAlpha(base, 0.55),
    };
}

/** Raise or lower an accent's lightness until it reads against `surface`. */
export function ensureAccentContrast(accent: string, surface: string): string {
    const [hue, saturation, lightness] = hexToHsl(accent);
    const towardLight = relativeLuminance(surface) <= DARK_SURFACE_MAX_LUMINANCE;

    let candidate = accent;
    let currentLightness = lightness;
    for (let step = 0; step < 20; step += 1) {
        if (contrastRatio(candidate, surface) >= MIN_ACCENT_CONTRAST) return candidate;
        currentLightness = clamp(currentLightness + (towardLight ? 0.04 : -0.04), 0.06, 0.96);
        candidate = hslToHex(hue, saturation, currentLightness);
    }
    return candidate;
}

/** The accent used when the user hasn't picked one: the first swatch that reads. */
export function autoAccent(swatches: string[], surface: string): string {
    return ensureAccentContrast(swatches[0] ?? "#e8a44a", surface);
}

/**
 * Build the `--accent-*` custom properties for a photo, mirroring the shape the
 * palettes declare in `app.css` so every surface keeps working unchanged.
 */
export function derivePhotoAccentTokens(accent: string, swatches: string[], tone: PhotoTone): Record<string, string> {
    const primary = ensureAccentContrast(accent, tone.base);
    const [hue, saturation, lightness] = hexToHsl(primary);
    const alternates = swatches.filter((swatch) => swatch !== accent);
    const secondary = ensureAccentContrast(alternates[0] ?? hslToHex(hue + 150, saturation, lightness), tone.base);
    const tertiary = ensureAccentContrast(alternates[1] ?? hslToHex(hue - 35, saturation * 0.8, lightness), tone.base);
    const softness = tone.isDark ? 1 : 0.85;

    return {
        "--accent-primary": primary,
        "--accent-primary-soft": withAlpha(primary, 0.12 * softness),
        "--accent-primary-dim": withAlpha(primary, 0.06 * softness),
        "--accent-secondary": secondary,
        "--accent-secondary-soft": withAlpha(secondary, 0.12 * softness),
        "--accent-tertiary": tertiary,
        "--accent-tertiary-soft": withAlpha(tertiary, 0.12 * softness),
        "--accent-glow": withAlpha(primary, tone.isDark ? 0.18 : 0.14),
        "--accent-surface": withAlpha(primary, tone.isDark ? 0.025 : 0.02),
        "--accent-on-primary": contrastRatio(primary, "#ffffff") >= 3.5 ? "#ffffff" : "#0f1d32",
    };
}

/** Blur percentage → CSS pixels. */
export function blurPixels(blur: number): number {
    return Math.round((clamp(blur, 0, 100) / 100) * MAX_BLUR_PX);
}
