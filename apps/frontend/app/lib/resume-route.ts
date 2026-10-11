/**
 * The installed app reopens on the screen the person left. iOS often closes a backgrounded Home Screen
 * app, which then relaunches at `start_url` (Capture) where a native app would come back to the same
 * screen. The workspace saves its screen as it goes and when it is hidden; the head script swaps a fresh
 * launch of `/` for it before the router starts. Past RESUME_FOR_MS the day has moved on, and Capture is home.
 */
export const RESUME_ROUTE_KEY = "cadence-resume-route";
export const RESUME_FOR_MS = 6 * 3600_000;

/** Screens worth coming back to: never auth, consent, desktop windows or redirects. */
const RESUMABLE = /^\/(?:today|schedule|events|upcoming|completed|trash|routines|browse|weekly-review|(?:project|tag)\/[\w-]+)$/;

/** Saves the screen being shown; anything else (Capture included) means the next launch opens Capture. */
export function rememberRoute(pathname: string, now = Date.now()): void {
    try {
        if (RESUMABLE.test(pathname)) localStorage.setItem(RESUME_ROUTE_KEY, JSON.stringify({ path: pathname, at: now }));
        else localStorage.removeItem(RESUME_ROUTE_KEY);
    } catch { /* storage blocked: launches open Capture */ }
}

export function forgetRoute(): void {
    try { localStorage.removeItem(RESUME_ROUTE_KEY); } catch { /* nothing saved */ }
}

/**
 * Head script: only a plain launch of `/` in the installed app (no query, no referrer, not a reload or
 * back/forward), so links, notification targets, sign-in returns and a tab never move.
 */
export const RESUME_ROUTE_SCRIPT = `(function(){try{var l=location,e=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];if(l.pathname!=='/'||l.search||l.hash||document.referrer||(e&&e.type!=='navigate'))return;if(!(navigator.standalone===true||matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches))return;var s=JSON.parse(localStorage.getItem(${JSON.stringify(RESUME_ROUTE_KEY)})||'null');if(s&&typeof s.path==='string'&&${RESUMABLE}.test(s.path)&&Date.now()-s.at<${RESUME_FOR_MS})history.replaceState(null,'',s.path)}catch(x){}})()`;
