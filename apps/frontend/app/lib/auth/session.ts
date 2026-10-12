import { authClient } from "../auth-client";

/** Bypass Neon's session cache, except during its deduplicated one-time verifier exchange. */
export function readFreshSession() {
    const exchanging = typeof window !== "undefined"
        && new URLSearchParams(window.location.search).has("neon_auth_session_verifier");
    return authClient.getSession(exchanging ? undefined : {
        fetchOptions: { headers: { "X-Force-Fetch": "true" }, cache: "no-store" },
    });
}

/** Expiry is a local lock, not an explicit sign-out: keep unsynced work on this device. */
const expiryListeners = new Set<() => void>();
export function subscribeSessionExpiry(listener: () => void) {
    expiryListeners.add(listener);
    return () => { expiryListeners.delete(listener); };
}
export function publishSessionExpiry() {
    expiryListeners.forEach((listener) => listener());
}

/** Only a still-live JWT can be used as a persisted/session fallback. Signature verification stays server-side. */
export function jwtExpiry(token: unknown, userId?: string): number {
    if (typeof token !== "string" || token.split(".").length !== 3) return 0;
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        if (userId !== undefined && payload.sub !== userId) return 0;
        return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1000 - 5_000 : 0;
    } catch { return 0; }
}
