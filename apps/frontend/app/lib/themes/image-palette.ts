import { wcagContrast } from "culori/fn";
import {
    chromaOf,
    hexOf,
    hexToRgb,
    hueOf,
    lightnessOf,
    relativeLuminance,
    rgbToHex,
    withLightness,
} from "./background-tokens";

export interface PhotoPalette {
    dominant: string;
    swatches: string[];
}

const DARK_SURFACE_MAX_LUMINANCE = 0.22;
const MIN_ACCENT_CONTRAST = 4.5;
const MAX_BLUR_PX = 40;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function withAlpha(hex: string, alpha: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

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
        swatches.push(hexOf(0.7, 0.08, hueOf(dominant)));
    }

    return { dominant, swatches };
}

export interface PhotoTone {
    base: string;
    isDark: boolean;
    scrim: string;
}

export function derivePhotoTone(dominant: string, brightness: number): PhotoTone {
    const scale = clamp(brightness, 20, 120) / 100;
    const lit = rgbToHex(hexToRgb(dominant).map((channel) => channel * scale) as [number, number, number]);
    const isDark = relativeLuminance(lit) <= DARK_SURFACE_MAX_LUMINANCE;
    const lightness = lightnessOf(lit);

    const base = isDark
        ? hexOf(Math.min(lightness, 0.2), Math.min(chromaOf(lit), 0.05), hueOf(lit))
        : hexOf(Math.max(lightness, 0.95), Math.min(chromaOf(lit), 0.035), hueOf(lit));

    return {
        base,
        isDark,
        scrim: isDark ? withAlpha(base, 0.62) : withAlpha(base, 0.55),
    };
}

export function ensureAccentContrast(accent: string, surface: string): string {
    if (wcagContrast(accent, surface) >= MIN_ACCENT_CONTRAST) return accent;
    const towardLight = relativeLuminance(surface) <= DARK_SURFACE_MAX_LUMINANCE;
    let near = lightnessOf(accent);
    let far = towardLight ? 0.97 : 0.05;
    if (wcagContrast(withLightness(accent, far), surface) < MIN_ACCENT_CONTRAST) return withLightness(accent, far);
    for (let i = 0; i < 14; i += 1) {
        const mid = (near + far) / 2;
        if (wcagContrast(withLightness(accent, mid), surface) >= MIN_ACCENT_CONTRAST) far = mid;
        else near = mid;
    }
    return withLightness(accent, far);
}

export function onAccent(primary: string): string {
    return wcagContrast(primary, "#ffffff") >= wcagContrast(primary, "#0f1d32") ? "#ffffff" : "#0f1d32";
}

export function autoAccent(swatches: string[], surface: string): string {
    return ensureAccentContrast(swatches[0] ?? "#e8a44a", surface);
}

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

export function blurPixels(blur: number): number {
    return Math.round((clamp(blur, 0, 100) / 100) * MAX_BLUR_PX);
}
