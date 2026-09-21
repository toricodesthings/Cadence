/**
 * Season detection for the adaptive loading screen.
 * Derives the current real-world season from Date(), with optional
 * override from a user's seasonal theme preset.
 */

export type Season = "spring" | "summer" | "autumn" | "winter";
export type LoadingMode = "twilight" | "daylight";

const MONTH_SEASONS: readonly Season[] = [
    "winter", "winter", "spring", "spring", "spring", "summer",
    "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

const LOADING_SEASON_BY_PRESET: Readonly<Record<string, Season>> = {
    "spring-bloom": "spring",
    "summer-coast": "summer",
    "autumn-hearth": "autumn",
    "winter-frost": "winter",
};

function getCurrentSeason(date: Date = new Date()): Season {
    return MONTH_SEASONS[date.getMonth()] ?? "autumn";
}

function getSeasonFromPreset(preset?: string): Season | null {
    if (!preset || !Object.prototype.hasOwnProperty.call(LOADING_SEASON_BY_PRESET, preset)) return null;
    return LOADING_SEASON_BY_PRESET[preset] ?? null;
}

/** Resolve the effective season: user preset overrides real-world date. */
export function resolveLoadingSeason(themePreset?: string): Season {
    return getSeasonFromPreset(themePreset) ?? getCurrentSeason();
}

/**
 * Head boot script (runs after the theme script, before first paint). Sets the
 * `<html>` attributes the loading scene's CSS keys off, so the pre-rendered
 * fallback shows the right season/mode/motion without JS-dependent markup.
 */
export const LOADING_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s={};try{s=JSON.parse(localStorage.getItem('cadence-appearance')||'{}')||{}}catch(e){}if(s.motion==='reduced'||s.motion==='full')d.setAttribute('data-motion',s.motion);var P=${JSON.stringify(LOADING_SEASON_BY_PRESET)},M=${JSON.stringify(MONTH_SEASONS)};d.setAttribute('data-loading-season',Object.prototype.hasOwnProperty.call(P,s.themePreset)?P[s.themePreset]:M[new Date().getMonth()]);d.setAttribute('data-loading-mode',d.getAttribute('data-theme')==='daylight'?'daylight':'twilight')}catch(e){}})()`;
