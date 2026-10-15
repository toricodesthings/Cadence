/**
 * Coordinated color palette definitions.
 *
 * Each palette is a hand-curated set of harmonious colors tuned for both
 * Twilight (dark) and Daylight (light) surfaces. The CSS tokens are applied
 * via `[data-palette="..."]` attributes on `<html>`.
 */

export type PaletteId =
    | "lantern"
    | "ember"
    | "rose"
    | "violet"
    | "sapphire"
    | "jade"
    | "copper"
    | "frost";

export interface PaletteColors {
    primary: string;
    primarySoft: string;
    primaryDim: string;
    secondary: string;
    secondarySoft: string;
    tertiary: string;
    tertiarySoft: string;
    glow: string;
    surface: string;
    onPrimary: string;
}

export interface PaletteDefinition {
    id: PaletteId;
    name: string;
    description: string;
    harmony: "analogous" | "split-complementary" | "triadic" | "compound";
    twilight: PaletteColors;
    daylight: PaletteColors;
}

export const ACCENT_PALETTES: PaletteDefinition[] = [
    {
        id: "lantern",
        name: "Lantern",
        description: "The signature Cadence glow — warm amber with moonlit blue",
        harmony: "analogous",
        twilight: {
            primary: "#e8a44a",
            primarySoft: "rgba(232, 164, 74, 0.12)",
            primaryDim: "rgba(232, 164, 74, 0.06)",
            secondary: "#7eb8d4",
            secondarySoft: "rgba(126, 184, 212, 0.12)",
            tertiary: "#d4a07e",
            tertiarySoft: "rgba(212, 160, 126, 0.12)",
            glow: "rgba(232, 164, 74, 0.18)",
            surface: "rgba(232, 164, 74, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#964200",
            primarySoft: "rgba(150, 66, 0, 0.10)",
            primaryDim: "rgba(150, 66, 0, 0.05)",
            secondary: "#006281",
            secondarySoft: "rgba(0, 98, 129, 0.10)",
            tertiary: "#7d5030",
            tertiarySoft: "rgba(125, 80, 48, 0.08)",
            glow: "rgba(150, 66, 0, 0.14)",
            surface: "rgba(150, 66, 0, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "ember",
        name: "Ember",
        description: "Sunset campfire energy — red-orange with sage green",
        harmony: "analogous",
        twilight: {
            primary: "#e87461",
            primarySoft: "rgba(232, 116, 97, 0.12)",
            primaryDim: "rgba(232, 116, 97, 0.06)",
            secondary: "#8bb8a6",
            secondarySoft: "rgba(139, 184, 166, 0.12)",
            tertiary: "#e8a87a",
            tertiarySoft: "rgba(232, 168, 122, 0.12)",
            glow: "rgba(232, 116, 97, 0.18)",
            surface: "rgba(232, 116, 97, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#a53300",
            primarySoft: "rgba(165, 51, 0, 0.08)",
            primaryDim: "rgba(165, 51, 0, 0.04)",
            secondary: "#286551",
            secondarySoft: "rgba(40, 101, 81, 0.08)",
            tertiary: "#8b491f",
            tertiarySoft: "rgba(139, 73, 31, 0.08)",
            glow: "rgba(165, 51, 0, 0.14)",
            surface: "rgba(165, 51, 0, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "rose",
        name: "Rose",
        description: "Cherry blossom warmth — sakura pink with teal and gold",
        harmony: "split-complementary",
        twilight: {
            primary: "#e879a8",
            primarySoft: "rgba(232, 121, 168, 0.12)",
            primaryDim: "rgba(232, 121, 168, 0.06)",
            secondary: "#79c4b8",
            secondarySoft: "rgba(121, 196, 184, 0.12)",
            tertiary: "#d4b078",
            tertiarySoft: "rgba(212, 176, 120, 0.12)",
            glow: "rgba(232, 121, 168, 0.18)",
            surface: "rgba(232, 121, 168, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#b40255",
            primarySoft: "rgba(180, 2, 85, 0.08)",
            primaryDim: "rgba(180, 2, 85, 0.04)",
            secondary: "#006758",
            secondarySoft: "rgba(0, 103, 88, 0.08)",
            tertiary: "#725615",
            tertiarySoft: "rgba(114, 86, 21, 0.08)",
            glow: "rgba(180, 2, 85, 0.14)",
            surface: "rgba(180, 2, 85, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "violet",
        name: "Violet",
        description: "Moonlit wisteria — purple with sage-green and dusty amber",
        harmony: "triadic",
        twilight: {
            primary: "#a78bfa",
            primarySoft: "rgba(167, 139, 250, 0.12)",
            primaryDim: "rgba(167, 139, 250, 0.06)",
            secondary: "#8bc4a3",
            secondarySoft: "rgba(139, 196, 163, 0.12)",
            tertiary: "#d4a882",
            tertiarySoft: "rgba(212, 168, 130, 0.12)",
            glow: "rgba(167, 139, 250, 0.18)",
            surface: "rgba(167, 139, 250, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#7129de",
            primarySoft: "rgba(113, 41, 222, 0.08)",
            primaryDim: "rgba(113, 41, 222, 0.04)",
            secondary: "#166742",
            secondarySoft: "rgba(22, 103, 66, 0.08)",
            tertiary: "#834e12",
            tertiarySoft: "rgba(131, 78, 18, 0.08)",
            glow: "rgba(113, 41, 222, 0.14)",
            surface: "rgba(113, 41, 222, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "sapphire",
        name: "Sapphire",
        description: "Deep ocean calm — blue with warm amber and dusty rose",
        harmony: "split-complementary",
        twilight: {
            primary: "#60a5fa",
            primarySoft: "rgba(96, 165, 250, 0.12)",
            primaryDim: "rgba(96, 165, 250, 0.06)",
            secondary: "#c4a882",
            secondarySoft: "rgba(196, 168, 130, 0.12)",
            tertiary: "#c48ea8",
            tertiarySoft: "rgba(196, 142, 168, 0.12)",
            glow: "rgba(96, 165, 250, 0.18)",
            surface: "rgba(96, 165, 250, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#114ed5",
            primarySoft: "rgba(17, 78, 213, 0.08)",
            primaryDim: "rgba(17, 78, 213, 0.04)",
            secondary: "#725623",
            secondarySoft: "rgba(114, 86, 35, 0.08)",
            tertiary: "#8a3d62",
            tertiarySoft: "rgba(138, 61, 98, 0.08)",
            glow: "rgba(17, 78, 213, 0.14)",
            surface: "rgba(17, 78, 213, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "jade",
        name: "Jade",
        description: "Forest sanctuary — green with terracotta and slate blue",
        harmony: "triadic",
        twilight: {
            primary: "#5dba72",
            primarySoft: "rgba(93, 186, 114, 0.12)",
            primaryDim: "rgba(93, 186, 114, 0.06)",
            secondary: "#c78768",
            secondarySoft: "rgba(199, 135, 104, 0.12)",
            tertiary: "#7e94d9",
            tertiarySoft: "rgba(126, 148, 217, 0.12)",
            glow: "rgba(93, 186, 114, 0.18)",
            surface: "rgba(93, 186, 114, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#00692e",
            primarySoft: "rgba(0, 105, 46, 0.08)",
            primaryDim: "rgba(0, 105, 46, 0.04)",
            secondary: "#804225",
            secondarySoft: "rgba(128, 66, 37, 0.08)",
            tertiary: "#3d4f9e",
            tertiarySoft: "rgba(61, 79, 158, 0.08)",
            glow: "rgba(0, 105, 46, 0.14)",
            surface: "rgba(0, 105, 46, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "copper",
        name: "Copper",
        description: "Rich artisan warmth — bronze with cool teal and burnished gold",
        harmony: "analogous",
        twilight: {
            primary: "#d9956a",
            primarySoft: "rgba(217, 149, 106, 0.12)",
            primaryDim: "rgba(217, 149, 106, 0.06)",
            secondary: "#7eb8d4",
            secondarySoft: "rgba(126, 184, 212, 0.12)",
            tertiary: "#d4c078",
            tertiarySoft: "rgba(212, 192, 120, 0.12)",
            glow: "rgba(217, 149, 106, 0.18)",
            surface: "rgba(217, 149, 106, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#92400e",
            primarySoft: "rgba(146, 64, 14, 0.08)",
            primaryDim: "rgba(146, 64, 14, 0.04)",
            secondary: "#006281",
            secondarySoft: "rgba(0, 98, 129, 0.08)",
            tertiary: "#695a02",
            tertiarySoft: "rgba(105, 90, 2, 0.08)",
            glow: "rgba(146, 64, 14, 0.14)",
            surface: "rgba(146, 64, 14, 0.02)",
            onPrimary: "#ffffff",
        },
    },
    {
        id: "frost",
        name: "Frost",
        description: "Winter morning clarity — cyan with warm amber and cool lavender",
        harmony: "compound",
        twilight: {
            primary: "#7eb8d4",
            primarySoft: "rgba(126, 184, 212, 0.12)",
            primaryDim: "rgba(126, 184, 212, 0.06)",
            secondary: "#d4a87e",
            secondarySoft: "rgba(212, 168, 126, 0.12)",
            tertiary: "#9aaed4",
            tertiarySoft: "rgba(154, 174, 212, 0.12)",
            glow: "rgba(126, 184, 212, 0.18)",
            surface: "rgba(126, 184, 212, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#00637d",
            primarySoft: "rgba(0, 99, 125, 0.08)",
            primaryDim: "rgba(0, 99, 125, 0.04)",
            secondary: "#76541b",
            secondarySoft: "rgba(118, 84, 27, 0.08)",
            tertiary: "#475a86",
            tertiarySoft: "rgba(71, 90, 134, 0.08)",
            glow: "rgba(0, 99, 125, 0.14)",
            surface: "rgba(0, 99, 125, 0.02)",
            onPrimary: "#ffffff",
        },
    },
];
