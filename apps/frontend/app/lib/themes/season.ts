/**
 * Season detection for the adaptive loading screen.
 * Derives the current real-world season from Date(), unless the user picked
 * one in Appearance → Loading screen (independent of the theme).
 */

export type Season = "spring" | "summer" | "autumn" | "winter";
export type LoadingMode = "twilight" | "daylight";

const MONTH_SEASONS: readonly Season[] = [
    "winter", "winter", "spring", "spring", "spring", "summer",
    "summer", "summer", "autumn", "autumn", "autumn", "winter",
];

function getCurrentSeason(date: Date = new Date()): Season {
    return MONTH_SEASONS[date.getMonth()] ?? "autumn";
}

const SEASONS: readonly string[] = ["spring", "summer", "autumn", "winter"];

/** Resolve the effective season: the user's pick, or the real-world date on "auto". */
export function resolveLoadingSeason(preference?: string): Season {
    return preference && SEASONS.includes(preference) ? (preference as Season) : getCurrentSeason();
}

/**
 * Head boot script (runs after the theme script, before first paint). Sets the
 * `<html>` attributes the loading scene's CSS keys off, so the pre-rendered
 * fallback shows the right season/mode/motion without JS-dependent markup.
 */
export const LOADING_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s={};try{s=JSON.parse(localStorage.getItem('cadence-appearance')||'{}')||{}}catch(e){}if(s.motion==='reduced'||s.motion==='full')d.setAttribute('data-motion',s.motion);var S=${JSON.stringify(SEASONS)},M=${JSON.stringify(MONTH_SEASONS)};d.setAttribute('data-loading-season',S.indexOf(s.loadingSeason)>-1?s.loadingSeason:M[new Date().getMonth()]);d.setAttribute('data-loading-mode',d.getAttribute('data-theme')==='daylight'?'daylight':'twilight');setTimeout(function(){d.setAttribute('data-loading-awake','')},600)}catch(e){}})()`;
