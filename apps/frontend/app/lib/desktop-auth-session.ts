import { IS_DESKTOP_RUNTIME, getNativeStore } from "../platform/runtime";

const DESKTOP_AUTH_STORE_NAME = "cadence_auth";
const DESKTOP_AUTH_STORAGE_KEY = "desktop_oauth_session";
const DESKTOP_AUTH_EVENT = "cadence:desktop-auth-session-changed";

export const DESKTOP_OAUTH_PAYLOAD_PARAM = "desktop_oauth_payload";

export interface DesktopAuthSessionData {
    session: {
        id?: string;
        token?: string;
        [key: string]: unknown;
    };
    user: {
        id: string;
        email?: string | null;
        name?: string | null;
        image?: string | null;
        [key: string]: unknown;
    };
}

export interface StoredDesktopAuthSession {
    jwt?: string | null;
    data: DesktopAuthSessionData;
    persistedAt: number;
}

let memoryCache: StoredDesktopAuthSession | null | undefined;

function hasWindow() {
    return typeof window !== "undefined";
}

function isTauriWindow() {
    return hasWindow() && "__TAURI_INTERNALS__" in window;
}

function canUseWebStorage() {
    return hasWindow() && typeof window.localStorage !== "undefined";
}

function toBase64Url(value: string) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const binary = atob(`${normalized}${padding}`);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

function isDesktopAuthSessionData(value: unknown): value is DesktopAuthSessionData {
    if (!value || typeof value !== "object") {
        return false;
    }

    const data = value as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | undefined;
    const session = data.session as Record<string, unknown> | undefined;

    return Boolean(
        user
        && session
        && typeof user.id === "string"
        && user.id.length > 0,
    );
}

function isStoredDesktopAuthSession(value: unknown): value is StoredDesktopAuthSession {
    if (!value || typeof value !== "object") {
        return false;
    }

    const session = value as Record<string, unknown>;
    return (session.jwt == null || (typeof session.jwt === "string" && session.jwt.length > 0))
        && typeof session.persistedAt === "number"
        && isDesktopAuthSessionData(session.data);
}

async function getStorageAdapter() {
    if (!IS_DESKTOP_RUNTIME || !isTauriWindow()) {
        return null;
    }

    try {
        return await getNativeStore(DESKTOP_AUTH_STORE_NAME);
    } catch {
        return null;
    }
}

function emitDesktopAuthSessionChange(session: StoredDesktopAuthSession | null) {
    if (!hasWindow()) {
        return;
    }

    window.dispatchEvent(new CustomEvent<StoredDesktopAuthSession | null>(DESKTOP_AUTH_EVENT, {
        detail: session,
    }));
}

export function serializeDesktopAuthPayload(session: StoredDesktopAuthSession) {
    return toBase64Url(JSON.stringify(session));
}

export function deserializeDesktopAuthPayload(payload: string): StoredDesktopAuthSession | null {
    try {
        const parsed = JSON.parse(fromBase64Url(payload)) as unknown;
        return isStoredDesktopAuthSession(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function readDesktopAuthSession(): Promise<StoredDesktopAuthSession | null> {
    if (memoryCache !== undefined) {
        return memoryCache;
    }

    const adapter = await getStorageAdapter();
    if (adapter) {
        const stored = await adapter.get<unknown>(DESKTOP_AUTH_STORAGE_KEY);
        memoryCache = isStoredDesktopAuthSession(stored) ? stored : null;
        return memoryCache;
    }

    if (!canUseWebStorage()) {
        memoryCache = null;
        return memoryCache;
    }

    try {
        const raw = window.localStorage.getItem(DESKTOP_AUTH_STORAGE_KEY);
        if (!raw) {
            memoryCache = null;
            return memoryCache;
        }

        const parsed = JSON.parse(raw) as unknown;
        memoryCache = isStoredDesktopAuthSession(parsed) ? parsed : null;
        return memoryCache;
    } catch {
        memoryCache = null;
        return memoryCache;
    }
}

export async function writeDesktopAuthSession(session: StoredDesktopAuthSession): Promise<void> {
    memoryCache = session;

    const adapter = await getStorageAdapter();
    if (adapter) {
        try {
            await adapter.set(DESKTOP_AUTH_STORAGE_KEY, session);
            emitDesktopAuthSessionChange(session);
            return;
        } catch {
            // Fall through to localStorage when the native store is unavailable.
        }
    }

    if (canUseWebStorage()) {
        window.localStorage.setItem(DESKTOP_AUTH_STORAGE_KEY, JSON.stringify(session));
        emitDesktopAuthSessionChange(session);
        return;
    }

    emitDesktopAuthSessionChange(session);
}

export async function clearDesktopAuthSession(): Promise<void> {
    memoryCache = null;

    const adapter = await getStorageAdapter();
    if (adapter) {
        await adapter.del(DESKTOP_AUTH_STORAGE_KEY);
        emitDesktopAuthSessionChange(null);
        return;
    }

    if (canUseWebStorage()) {
        window.localStorage.removeItem(DESKTOP_AUTH_STORAGE_KEY);
    }

    emitDesktopAuthSessionChange(null);
}

export function subscribeDesktopAuthSession(listener: (session: StoredDesktopAuthSession | null) => void) {
    if (!hasWindow()) {
        return () => {};
    }

    const handleCustomEvent = (event: Event) => {
        listener((event as CustomEvent<StoredDesktopAuthSession | null>).detail ?? null);
    };

    const handleStorageEvent = (event: StorageEvent) => {
        if (event.key !== DESKTOP_AUTH_STORAGE_KEY) {
            return;
        }

        if (!event.newValue) {
            listener(null);
            return;
        }

        try {
            const parsed = JSON.parse(event.newValue) as unknown;
            listener(isStoredDesktopAuthSession(parsed) ? parsed : null);
        } catch {
            listener(null);
        }
    };

    window.addEventListener(DESKTOP_AUTH_EVENT, handleCustomEvent as EventListener);
    window.addEventListener("storage", handleStorageEvent);

    return () => {
        window.removeEventListener(DESKTOP_AUTH_EVENT, handleCustomEvent as EventListener);
        window.removeEventListener("storage", handleStorageEvent);
    };
}