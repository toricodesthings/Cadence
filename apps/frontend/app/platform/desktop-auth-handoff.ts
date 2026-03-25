import { IS_DESKTOP_RUNTIME, getNativeStore } from "./runtime";

export const DESKTOP_AUTH_STATE_PARAM = "desktop_auth_state";

const DESKTOP_AUTH_HANDOFF_STORE = "cadence_auth";
const DESKTOP_AUTH_HANDOFF_KEY = "desktop_oauth_handoff";
const DESKTOP_AUTH_HANDOFF_STORAGE_KEY = "cadence:desktop-auth-handoff";
const DESKTOP_AUTH_HANDOFF_TTL_MS = 1000 * 60 * 5;

interface PendingDesktopAuthHandoff {
    state: string;
    redirectTo: string;
    createdAt: number;
    expiresAt: number;
}

function hasWindow() {
    return typeof window !== "undefined";
}

function isTauriWindow() {
    return hasWindow() && "__TAURI_INTERNALS__" in window;
}

function canUseWebStorage() {
    return hasWindow() && typeof window.localStorage !== "undefined";
}

function isPendingDesktopAuthHandoff(value: unknown): value is PendingDesktopAuthHandoff {
    if (!value || typeof value !== "object") {
        return false;
    }

    const handoff = value as Record<string, unknown>;
    return typeof handoff.state === "string"
        && handoff.state.length > 0
        && typeof handoff.redirectTo === "string"
        && typeof handoff.createdAt === "number"
        && typeof handoff.expiresAt === "number";
}

async function getStorageAdapter() {
    if (!IS_DESKTOP_RUNTIME || !isTauriWindow()) {
        return null;
    }

    try {
        return await getNativeStore(DESKTOP_AUTH_HANDOFF_STORE);
    } catch {
        return null;
    }
}

function createStateToken() {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    }

    return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

async function readPendingDesktopAuthHandoff() {
    const adapter = await getStorageAdapter();
    if (adapter) {
        const stored = await adapter.get<unknown>(DESKTOP_AUTH_HANDOFF_KEY);
        return isPendingDesktopAuthHandoff(stored) ? stored : null;
    }

    if (!canUseWebStorage()) {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(DESKTOP_AUTH_HANDOFF_STORAGE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as unknown;
        return isPendingDesktopAuthHandoff(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function writePendingDesktopAuthHandoff(handoff: PendingDesktopAuthHandoff) {
    const adapter = await getStorageAdapter();
    if (adapter) {
        await adapter.set(DESKTOP_AUTH_HANDOFF_KEY, handoff);
        return;
    }

    if (canUseWebStorage()) {
        window.localStorage.setItem(DESKTOP_AUTH_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
    }
}

async function clearPendingDesktopAuthHandoff() {
    const adapter = await getStorageAdapter();
    if (adapter) {
        await adapter.del(DESKTOP_AUTH_HANDOFF_KEY);
        return;
    }

    if (canUseWebStorage()) {
        window.localStorage.removeItem(DESKTOP_AUTH_HANDOFF_STORAGE_KEY);
    }
}

export async function prepareDesktopAuthHandoff(redirectTo: string) {
    const createdAt = Date.now();
    const handoff: PendingDesktopAuthHandoff = {
        state: createStateToken(),
        redirectTo,
        createdAt,
        expiresAt: createdAt + DESKTOP_AUTH_HANDOFF_TTL_MS,
    };

    await writePendingDesktopAuthHandoff(handoff);
    return handoff.state;
}

export async function consumeDesktopAuthHandoff(state: string, redirectTo: string) {
    const handoff = await readPendingDesktopAuthHandoff();
    await clearPendingDesktopAuthHandoff();

    if (!handoff) {
        return false;
    }

    if (handoff.expiresAt < Date.now()) {
        return false;
    }

    return handoff.state === state && handoff.redirectTo === redirectTo;
}