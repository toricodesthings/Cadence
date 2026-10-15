/**
 * Background token derivation utilities.
 *
 * Computes derived CSS tokens from a user-selected background color,
 * including luminance-adaptive text color, surface shifts, and border opacity.
 */
import {
    clampChroma,
    converter,
    formatHex,
    interpolate,
    modeHsl,
    modeLrgb,
    modeOklab,
    modeOklch,
    modeRgb,
    samples,
    useMode,
    wcagLuminance,
} from "culori/fn";

// Registered once here: image-palette.ts imports this file, so registration always runs first.
useMode(modeRgb);
useMode(modeLrgb);
useMode(modeHsl);
useMode(modeOklab);
useMode(modeOklch);

const toOklch = converter("oklch");

/** A colour from OKLCH parts, pulled into sRGB by shrinking chroma only. */
export const hexOf = (l: number, c: number, h: number): string =>
    formatHex(clampChroma({ mode: "oklch", l, c, h: ((h % 360) + 360) % 360 }, "oklch"));
/** The same hue and chroma at another lightness. */
export const withLightness = (hex: string, l: number): string => {
    const { c, h } = toOklch(hex)!;
    return hexOf(l, c, h ?? 0);
};
export const lightnessOf = (hex: string): number => toOklch(hex)!.l;
export const chromaOf = (hex: string): number => toOklch(hex)!.c;
/** Greys have no hue; Cadence uses 0. */
export const hueOf = (hex: string): number => toOklch(hex)!.h ?? 0;

/** Parse hex (#RRGGBB) to [r, g, b] in 0-255 range */
export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

/** Format [r, g, b] channels (0-255, unrounded) as a #RRGGBB hex string */
export function rgbToHex(channels: [number, number, number] | number[]): string {
    return `#${channels
        .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
        .join("")}`;
}

/**
 * Compute WCAG relative luminance from a hex color.
 * Returns a value between 0 (black) and 1 (white).
 */
export const relativeLuminance = (hex: string): number => wcagLuminance(hex);

/** Shift perceived lightness (OKLab L) by an amount, keeping hue and chroma. */
function shiftLightness(hex: string, amount: number): string {
    return withLightness(hex, Math.max(0, Math.min(1, lightnessOf(hex) + amount)));
}

/**
 * Derive a complete set of CSS custom properties from a single background hex color.
 * Implements the luminance-adaptive token system from the theming plan.
 */
export function deriveCustomTokens(hex: string): Record<string, string> {
    const lum = relativeLuminance(hex);
    const isDark = lum <= 0.18;

    // Text and border colors based on luminance
    const textBase = isDark ? "232, 237, 245" : "30, 41, 59";
    const textHex = isDark ? "#e8edf5" : "#1e293b";

    return {
        "--color-bg-custom": hex,
        "--color-bg-deep": shiftLightness(hex, -0.03),
        "--color-bg-surface": shiftLightness(hex, 0.04),
        "--color-bg-elevated": shiftLightness(hex, 0.07),
        "--color-bg-text": textHex,
        "--color-bg-text-soft": `rgba(${textBase}, 0.7)`,
        "--color-bg-text-muted": `rgba(${textBase}, 0.45)`,
        "--color-bg-border": `rgba(${textBase}, 0.12)`,
        "--color-bg-border-light": `rgba(${textBase}, 0.06)`,
    };
}

/**
 * Compute luminance for a gradient midpoint (average of two colors).
 */
function gradientMidpointLuminance(hex1: string, hex2: string): number {
    return (relativeLuminance(hex1) + relativeLuminance(hex2)) / 2;
}

/** Base color for a gradient background: its midpoint keeps the hue; light gradients are pulled toward a neutral light base. */
export function gradientBaseHex(hex1: string, hex2: string): string {
    const mid = formatHex(interpolate([hex1, hex2], "oklab")(0.5))!;
    if (gradientMidpointLuminance(hex1, hex2) <= 0.18) return mid;
    return formatHex(interpolate([mid, "#f5f5f5"], "oklab")(0.7))!;
}

/** Build a CSS linear-gradient value from two colors and an angle */
export function buildGradientCSS(
    color1: string,
    color2: string,
    direction: number
): string {
    const stops = samples(5).map(interpolate([color1, color2], "oklab")).map((c) => formatHex(c)!);
    return `linear-gradient(${direction}deg, ${stops.join(", ")})`;
}
