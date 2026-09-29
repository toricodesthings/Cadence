import { getWebStorage } from "../../platform/runtime";

/**
 * Who was signed in on this device, so a cold start without a connection can
 * open their cached workspace instead of the sign-in page. No tokens: every
 * write is still authenticated by the server when it syncs.
 */
export interface OfflineIdentity {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
}

const KEY = "cadence-offline-identity";

export function rememberIdentity({ id, email, name, image }: OfflineIdentity): void {
    try {
        getWebStorage()?.setItem(KEY, JSON.stringify({ id, email, name, image }));
    } catch {
        // Storage full or blocked: offline start just won't be available.
    }
}

export function readIdentity(): OfflineIdentity | null {
    try {
        const value = JSON.parse(getWebStorage()?.getItem(KEY) ?? "null") as OfflineIdentity | null;
        return typeof value?.id === "string" ? value : null;
    } catch {
        return null;
    }
}

export function forgetIdentity(): void {
    try {
        getWebStorage()?.removeItem(KEY);
    } catch {
        // Nothing to clear.
    }
}
