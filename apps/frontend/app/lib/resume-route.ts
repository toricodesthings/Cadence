export const RESUME_ROUTE_KEY = "cadence-resume-route";
export const RESUME_FOR_MS = 6 * 3600_000;

const RESUMABLE =
    /^\/(?:today|schedule|events|upcoming|completed|trash|routines|browse|weekly-review|(?:project|tag)\/[\w-]+)$/;

export function rememberRoute(pathname: string, now = Date.now()): void {
    try {
        if (RESUMABLE.test(pathname))
            localStorage.setItem(RESUME_ROUTE_KEY, JSON.stringify({ path: pathname, at: now }));
        else localStorage.removeItem(RESUME_ROUTE_KEY);
    } catch {}
}

export function forgetRoute(): void {
    try {
        localStorage.removeItem(RESUME_ROUTE_KEY);
    } catch {}
}

export const RESUME_ROUTE_SCRIPT = `(function(){try{var l=location,e=performance.getEntriesByType&&performance.getEntriesByType('navigation')[0];if(l.pathname!=='/'||l.search||l.hash||document.referrer||(e&&e.type!=='navigate'))return;if(!(navigator.standalone===true||matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches))return;var s=JSON.parse(localStorage.getItem(${JSON.stringify(RESUME_ROUTE_KEY)})||'null');if(s&&typeof s.path==='string'&&${RESUMABLE}.test(s.path)&&Date.now()-s.at<${RESUME_FOR_MS})history.replaceState(null,'',s.path)}catch(x){}})()`;

let lastWorkspacePath: string | null = null;

export const noteWorkspacePath = (pathname: string, search: string): void => {
    if (pathname !== "/weekly-review" && RESUMABLE.test(pathname)) lastWorkspacePath = pathname + search;
};

export const returnPath = (): string => lastWorkspacePath ?? "/today";
