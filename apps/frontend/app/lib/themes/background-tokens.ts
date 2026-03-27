/**
 * Background token derivation utilities.
 *
 * Computes derived CSS tokens from a user-selected background color,
 * including luminance-adaptive text color, surface shifts, and border opacity.
 */

/** Parse hex (#RRGGBB) to [r, g, b] in 0-255 range */
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
    ];
}

/** Linearize a single sRGB channel (0-255 → 0-1 linear) */
function linearize(c: number): number {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * Compute WCAG relative luminance from a hex color.
 * Returns a value between 0 (black) and 1 (white).
 */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Shift lightness of a color by a relative amount (-1 to +1) */
function shiftLightness(hex: string, amount: number): string {
    const [r, g, b] = hexToRgb(hex);
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const shift = amount * 255;
    return `#${[r, g, b].map((c) => clamp(c + shift).toString(16).padStart(2, "0")).join("")}`;
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
        "--color-bg-deep": shiftLightness(hex, -0.04),
        "--color-bg-surface": shiftLightness(hex, 0.05),
        "--color-bg-elevated": shiftLightness(hex, 0.09),
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
export function gradientMidpointLuminance(hex1: string, hex2: string): number {
    return (relativeLuminance(hex1) + relativeLuminance(hex2)) / 2;
}

/**
 * Validate a hex color for background use.
 * Returns a contrast safety indicator.
 */
export function getContrastSafety(hex: string): "safe-dark" | "safe-light" | "caution" {
    const lum = relativeLuminance(hex);
    if (lum <= 0.08) return "safe-dark";
    if (lum >= 0.35) return "safe-light";
    return "caution";
}

/** Build a CSS linear-gradient value from two colors and an angle */
export function buildGradientCSS(
    color1: string,
    color2: string,
    direction: number
): string {
    return `linear-gradient(${direction}deg, ${color1}, ${color2})`;
}
