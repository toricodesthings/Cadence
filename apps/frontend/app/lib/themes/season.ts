/**
 * Season detection for the adaptive loading screen.
 * Derives the current real-world season from Date(), with optional
 * override from a user's seasonal theme preset.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";

export function getCurrentSeason(): Season {
    const month = new Date().getMonth(); // 0-indexed
    if (month >= 2 && month <= 4) return "spring";
    if (month >= 5 && month <= 7) return "summer";
    if (month >= 8 && month <= 10) return "autumn";
    return "winter";
}

export function getSeasonFromPreset(preset?: string): Season | null {
    switch (preset) {
        case "spring-bloom":
            return "spring";
        case "summer-coast":
            return "summer";
        case "autumn-hearth":
            return "autumn";
        case "winter-frost":
            return "winter";
        default:
            return null;
    }
}

/** Resolve the effective season: user preset overrides real-world date. */
export function resolveLoadingSeason(themePreset?: string): Season {
    return getSeasonFromPreset(themePreset) ?? getCurrentSeason();
}
