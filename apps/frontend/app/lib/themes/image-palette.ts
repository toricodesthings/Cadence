/**
 * Colour reading for photo backgrounds.
 *
 * Everything here is pure: the caller samples the photo into RGBA pixels
 * (`readImagePixels`) and these functions turn them into an average tone, a set
 * of accent candidates, and the CSS custom properties the app themes itself
 * with. Contrast is enforced against the surface the accent will actually sit
 * on, so a photo can never push the interface below the readable floor.
 */

import { wcagContrast } from "culori/fn";
import { chromaOf, hexOf, hexToRgb, hueOf, lightnessOf, relativeLuminance, rgbToHex, withLightness } from "./background-tokens";

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
            const hue = hueOf(hex);
            // Favour colour that a person would call colourful, in the middle of
            // the lightness range; frequency is a tiebreaker, not the driver.
            const colourfulness = Math.min(chromaOf(hex) / 0.1, 1);
            const usableLightness = 1 - Math.abs(lightnessOf(hex) - 0.7) / 0.5;
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
        swatches.push(hexOf(0.7, 0.08, hueOf(dominant)));
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
    const lightness = lightnessOf(lit);

    // Push the surface tone well clear of the midtones so text never lands in
    // the unreadable middle, keeping the photo's hue. Fixed perceived lightness
    // (OKLab L) keeps every hue equally deep.
    const base = isDark
        ? hexOf(Math.min(lightness, 0.2), Math.min(chromaOf(lit), 0.05), hueOf(lit))
        : hexOf(Math.max(lightness, 0.95), Math.min(chromaOf(lit), 0.035), hueOf(lit));

    return {
        base,
        isDark,
        scrim: isDark ? withAlpha(base, 0.62) : withAlpha(base, 0.55),
    };
}

/** Raise or lower an accent's lightness (OKLCH) until it reads against `surface`; hue and chroma stay. */
export function ensureAccentContrast(accent: string, surface: string): string {
    if (wcagContrast(accent, surface) >= MIN_ACCENT_CONTRAST) return accent;
    const towardLight = relativeLuminance(surface) <= DARK_SURFACE_MAX_LUMINANCE;
    let near = lightnessOf(accent); // fails
    let far = towardLight ? 0.97 : 0.05; // the extreme
    if (wcagContrast(withLightness(accent, far), surface) < MIN_ACCENT_CONTRAST) return withLightness(accent, far);
    for (let i = 0; i < 14; i += 1) {
        const mid = (near + far) / 2;
        if (wcagContrast(withLightness(accent, mid), surface) >= MIN_ACCENT_CONTRAST) far = mid;
        else near = mid;
    }
    return withLightness(accent, far);
}

/** Text colour for a filled accent: whichever of white or navy reads better. */
export function onAccent(primary: string): string {
    return wcagContrast(primary, "#ffffff") >= wcagContrast(primary, "#0f1d32") ? "#ffffff" : "#0f1d32";
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
    const l = lightnessOf(primary);
    const c = chromaOf(primary);
    const h = hueOf(primary);
    const alternates = swatches.filter((swatch) => swatch !== accent);
    const secondary = ensureAccentContrast(alternates[0] ?? hexOf(l, c, h + 150), tone.base);
    const tertiary = ensureAccentContrast(alternates[1] ?? hexOf(l, c * 0.8, h - 35), tone.base);
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
        "--accent-on-primary": onAccent(primary),
    };
}

/** Blur percentage → CSS pixels. */
export function blurPixels(blur: number): number {
    return Math.round((clamp(blur, 0, 100) / 100) * MAX_BLUR_PX);
}
