const KEY = "cadence:legal-ticked-at";
const FRESH_MS = 60 * 60 * 1000;

export function rememberSignUpTicks(ticked: boolean) {
    try {
        if (ticked) localStorage.setItem(KEY, new Date().toISOString());
        else localStorage.removeItem(KEY);
    } catch {}
}

export function takeSignUpTicks(): string | null {
    try {
        const at = localStorage.getItem(KEY);
        localStorage.removeItem(KEY);
        return at && Date.now() - Date.parse(at) < FRESH_MS ? at : null;
    } catch {
        return null;
    }
}
