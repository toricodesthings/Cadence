import { getWebStorage } from "../../platform/runtime";

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
    } catch {}
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
    } catch {}
}
