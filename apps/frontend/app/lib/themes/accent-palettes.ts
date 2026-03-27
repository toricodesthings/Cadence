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
            primary: "#b45309",
            primarySoft: "rgba(180, 83, 9, 0.10)",
            primaryDim: "rgba(180, 83, 9, 0.05)",
            secondary: "#1a7a9b",
            secondarySoft: "rgba(26, 122, 155, 0.10)",
            tertiary: "#8b5e3c",
            tertiarySoft: "rgba(139, 94, 60, 0.08)",
            glow: "rgba(180, 83, 9, 0.14)",
            surface: "rgba(180, 83, 9, 0.02)",
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
            primary: "#c2410c",
            primarySoft: "rgba(194, 65, 12, 0.08)",
            primaryDim: "rgba(194, 65, 12, 0.04)",
            secondary: "#3d7a64",
            secondarySoft: "rgba(61, 122, 100, 0.08)",
            tertiary: "#9e5a30",
            tertiarySoft: "rgba(158, 90, 48, 0.08)",
            glow: "rgba(194, 65, 12, 0.14)",
            surface: "rgba(194, 65, 12, 0.02)",
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
            primary: "#be185d",
            primarySoft: "rgba(190, 24, 93, 0.08)",
            primaryDim: "rgba(190, 24, 93, 0.04)",
            secondary: "#18816f",
            secondarySoft: "rgba(24, 129, 111, 0.08)",
            tertiary: "#8a6d2f",
            tertiarySoft: "rgba(138, 109, 47, 0.08)",
            glow: "rgba(190, 24, 93, 0.14)",
            surface: "rgba(190, 24, 93, 0.02)",
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
            onPrimary: "#ffffff",
        },
        daylight: {
            primary: "#7c3aed",
            primarySoft: "rgba(124, 58, 237, 0.08)",
            primaryDim: "rgba(124, 58, 237, 0.04)",
            secondary: "#2d7a52",
            secondarySoft: "rgba(45, 122, 82, 0.08)",
            tertiary: "#9e6830",
            tertiarySoft: "rgba(158, 104, 48, 0.08)",
            glow: "rgba(124, 58, 237, 0.14)",
            surface: "rgba(124, 58, 237, 0.02)",
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
            primary: "#2563eb",
            primarySoft: "rgba(37, 99, 235, 0.08)",
            primaryDim: "rgba(37, 99, 235, 0.04)",
            secondary: "#8a6d3a",
            secondarySoft: "rgba(138, 109, 58, 0.08)",
            tertiary: "#8a3d62",
            tertiarySoft: "rgba(138, 61, 98, 0.08)",
            glow: "rgba(37, 99, 235, 0.14)",
            surface: "rgba(37, 99, 235, 0.02)",
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
            secondary: "#ba7a5d",
            secondarySoft: "rgba(186, 122, 93, 0.12)",
            tertiary: "#7a8fd4",
            tertiarySoft: "rgba(122, 143, 212, 0.12)",
            glow: "rgba(93, 186, 114, 0.18)",
            surface: "rgba(93, 186, 114, 0.025)",
            onPrimary: "#0f1d32",
        },
        daylight: {
            primary: "#15803d",
            primarySoft: "rgba(21, 128, 61, 0.08)",
            primaryDim: "rgba(21, 128, 61, 0.04)",
            secondary: "#804225",
            secondarySoft: "rgba(128, 66, 37, 0.08)",
            tertiary: "#3d4f9e",
            tertiarySoft: "rgba(61, 79, 158, 0.08)",
            glow: "rgba(21, 128, 61, 0.14)",
            surface: "rgba(21, 128, 61, 0.02)",
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
            secondary: "#1a7a9b",
            secondarySoft: "rgba(26, 122, 155, 0.08)",
            tertiary: "#8a7a2f",
            tertiarySoft: "rgba(138, 122, 47, 0.08)",
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
            primary: "#0e7490",
            primarySoft: "rgba(14, 116, 144, 0.08)",
            primaryDim: "rgba(14, 116, 144, 0.04)",
            secondary: "#8a6830",
            secondarySoft: "rgba(138, 104, 48, 0.08)",
            tertiary: "#4a5e8a",
            tertiarySoft: "rgba(74, 94, 138, 0.08)",
            glow: "rgba(14, 116, 144, 0.14)",
            surface: "rgba(14, 116, 144, 0.02)",
            onPrimary: "#ffffff",
        },
    },
];

export const PALETTE_MAP = Object.fromEntries(
    ACCENT_PALETTES.map((p) => [p.id, p])
) as Record<PaletteId, PaletteDefinition>;
