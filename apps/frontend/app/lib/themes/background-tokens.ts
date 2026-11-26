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
    useMode as registerMode,
    wcagLuminance,
} from "culori/fn";

registerMode(modeRgb);
registerMode(modeLrgb);
registerMode(modeHsl);
registerMode(modeOklab);
registerMode(modeOklch);

const toOklch = converter("oklch");

export const hexOf = (l: number, c: number, h: number): string =>
    formatHex(clampChroma({ mode: "oklch", l, c, h: ((h % 360) + 360) % 360 }, "oklch"));
export const withLightness = (hex: string, l: number): string => {
    const { c, h } = toOklch(hex)!;
    return hexOf(l, c, h ?? 0);
};
export const lightnessOf = (hex: string): number => toOklch(hex)!.l;
export const chromaOf = (hex: string): number => toOklch(hex)!.c;
export const hueOf = (hex: string): number => toOklch(hex)!.h ?? 0;

export function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(channels: [number, number, number] | number[]): string {
    return `#${channels
        .map((channel) =>
            Math.max(0, Math.min(255, Math.round(channel)))
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

export const relativeLuminance = (hex: string): number => wcagLuminance(hex);

function shiftLightness(hex: string, amount: number): string {
    return withLightness(hex, Math.max(0, Math.min(1, lightnessOf(hex) + amount)));
}

export function deriveCustomTokens(hex: string): Record<string, string> {
    const lum = relativeLuminance(hex);
    const isDark = lum <= 0.18;

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

function gradientMidpointLuminance(hex1: string, hex2: string): number {
    return (relativeLuminance(hex1) + relativeLuminance(hex2)) / 2;
}

export function gradientBaseHex(hex1: string, hex2: string): string {
    const mid = formatHex(interpolate([hex1, hex2], "oklab")(0.5))!;
    if (gradientMidpointLuminance(hex1, hex2) <= 0.18) return mid;
    return formatHex(interpolate([mid, "#f5f5f5"], "oklab")(0.7))!;
}

export function buildGradientCSS(color1: string, color2: string, direction: number): string {
    const stops = samples(5)
        .map(interpolate([color1, color2], "oklab"))
        .map((c) => formatHex(c)!);
    return `linear-gradient(${direction}deg, ${stops.join(", ")})`;
}
