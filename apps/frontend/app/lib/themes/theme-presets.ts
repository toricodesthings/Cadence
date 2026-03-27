/**
 * Seasonal & curated theme preset definitions.
 *
 * Each preset bundles a base mode, accent palette, and optional surface tint
 * into a unified visual experience. Selecting a preset applies all three;
 * overriding any component switches to "custom".
 */

import type { PaletteId } from "./accent-palettes";

export type ThemePresetId =
    | "default"
    | "daylight-default"
    | "spring-bloom"
    | "summer-coast"
    | "autumn-hearth"
    | "winter-frost"
    | "midnight-garden"
    | "golden-hour";

export interface ThemePreset {
    id: ThemePresetId;
    name: string;
    icon: string;
    baseMode: "twilight" | "daylight";
    palette: PaletteId;
    surfaceTint: string | null;
    mood: string;
    season?: "spring" | "summer" | "autumn" | "winter";
    suggestedGradient?: {
        color1: string;
        color2: string;
        direction: number;
    };
}

export const THEME_PRESETS: ThemePreset[] = [
    {
        id: "default",
        name: "Twilight Sanctuary",
        icon: "🌙",
        baseMode: "twilight",
        palette: "lantern",
        surfaceTint: null,
        mood: "The classic Cadence experience",
    },
    {
        id: "daylight-default",
        name: "Daylight Room",
        icon: "☀️",
        baseMode: "daylight",
        palette: "lantern",
        surfaceTint: null,
        mood: "The classic light experience",
    },
    {
        id: "spring-bloom",
        name: "Spring Bloom",
        icon: "🌸",
        baseMode: "twilight",
        palette: "rose",
        surfaceTint: "rgba(232, 121, 168, 0.02)",
        mood: "Cherry blossoms at dusk, soft pink warmth",
        season: "spring",
        suggestedGradient: { color1: "#2d1f30", color2: "#1a1225", direction: 180 },
    },
    {
        id: "summer-coast",
        name: "Summer Coast",
        icon: "🌊",
        baseMode: "daylight",
        palette: "sapphire",
        surfaceTint: "rgba(96, 165, 250, 0.03)",
        mood: "Ocean breeze, bright and breezy",
        season: "summer",
        suggestedGradient: { color1: "#0a2540", color2: "#0f1a30", direction: 135 },
    },
    {
        id: "autumn-hearth",
        name: "Autumn Hearth",
        icon: "🍂",
        baseMode: "twilight",
        palette: "copper",
        surfaceTint: "rgba(217, 149, 106, 0.03)",
        mood: "Crackling fireplace, harvest warmth",
        season: "autumn",
        suggestedGradient: { color1: "#2d1a10", color2: "#1a0f08", direction: 180 },
    },
    {
        id: "winter-frost",
        name: "Winter Frost",
        icon: "❄️",
        baseMode: "twilight",
        palette: "frost",
        surfaceTint: "rgba(126, 184, 212, 0.03)",
        mood: "Snowfall at night, cool and crisp",
        season: "winter",
        suggestedGradient: { color1: "#1a2030", color2: "#0f1830", direction: 180 },
    },
    {
        id: "midnight-garden",
        name: "Midnight Garden",
        icon: "🌿",
        baseMode: "twilight",
        palette: "violet",
        surfaceTint: "rgba(167, 139, 250, 0.02)",
        mood: "Moonlit wisteria, deep and dreamy",
        season: undefined,
        suggestedGradient: { color1: "#1a1030", color2: "#0f0a20", direction: 180 },
    },
    {
        id: "golden-hour",
        name: "Golden Hour",
        icon: "🌅",
        baseMode: "daylight",
        palette: "ember",
        surfaceTint: "rgba(232, 116, 97, 0.02)",
        mood: "Sunset warmth, rich and vibrant",
        season: undefined,
        suggestedGradient: { color1: "#2d1510", color2: "#1a0f0a", direction: 180 },
    },
];

export const THEME_PRESET_MAP = Object.fromEntries(
    THEME_PRESETS.map((t) => [t.id, t])
) as Record<ThemePresetId, ThemePreset>;
