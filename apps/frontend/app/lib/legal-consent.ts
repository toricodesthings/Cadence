// Sign-up asks for the two legal ticks before it hands off to email or Google/GitHub, and the account only exists
// after that round trip. This remembers the ticks across it so the new account isn't asked a second time.
const KEY = "cadence:legal-ticked-at";
const FRESH_MS = 60 * 60 * 1000;

export function rememberSignUpTicks(ticked: boolean) {
    try {
        if (ticked) localStorage.setItem(KEY, new Date().toISOString());
        else localStorage.removeItem(KEY);
    } catch {
        // Storage blocked: the account is asked once inside the app instead
    }
}

/** When the person ticked on the sign-up page within the last hour (the flag is used up), else null. */
export function takeSignUpTicks(): string | null {
    try {
        const at = localStorage.getItem(KEY);
        localStorage.removeItem(KEY);
        return at && Date.now() - Date.parse(at) < FRESH_MS ? at : null;
    } catch {
        return null;
    }
}
