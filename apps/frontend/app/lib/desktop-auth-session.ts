import {
    clearDesktopSecureSecret,
    readDesktopSecureSecret,
    writeDesktopSecureSecret,
} from "../platform/desktop-keyring";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../platform/runtime";

const DESKTOP_AUTH_STORE_NAME = "cadence_auth";
const DESKTOP_AUTH_STORAGE_KEY = "desktop_oauth_session";
const DESKTOP_AUTH_JWT_SECRET_KEY = "desktop_oauth_jwt";
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

function logDesktopAuthDebug(message: string, details?: Record<string, unknown>) {
    if (!import.meta.env.DEV) {
        return;
    }

    if (details) {
        console.info(`[cadence:desktop-auth] ${message}`, details);
        return;
    }

    console.info(`[cadence:desktop-auth] ${message}`);
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

function isPersistedDesktopAuthSessionMetadata(value: unknown): value is Omit<StoredDesktopAuthSession, "jwt"> {
    if (!value || typeof value !== "object") {
        return false;
    }

    const session = value as Record<string, unknown>;
    return typeof session.persistedAt === "number"
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
        logDesktopAuthDebug("returning desktop auth session from memory cache", {
            present: Boolean(memoryCache),
            hasJwt: Boolean(memoryCache?.jwt),
        });
        return memoryCache;
    }

    const adapter = await getStorageAdapter();
    if (adapter) {
        const stored = await adapter.get<unknown>(DESKTOP_AUTH_STORAGE_KEY);
        if (!isPersistedDesktopAuthSessionMetadata(stored)) {
            logDesktopAuthDebug("native desktop auth store missing valid metadata");
            memoryCache = null;
            return memoryCache;
        }

        const jwt = await readDesktopSecureSecret(DESKTOP_AUTH_JWT_SECRET_KEY);
        if (!jwt) {
            console.warn("[cadence:desktop-auth] native desktop auth metadata exists but secure JWT is missing");
            await adapter.del(DESKTOP_AUTH_STORAGE_KEY).catch(() => undefined);
            memoryCache = null;
            return memoryCache;
        }

        const hydrated = { ...stored, jwt };
        memoryCache = isStoredDesktopAuthSession(hydrated) ? hydrated : null;
        logDesktopAuthDebug("loaded desktop auth session from native store", {
            present: Boolean(memoryCache),
            hasJwt: Boolean(memoryCache?.jwt),
            userId: memoryCache?.data.user.id ?? null,
        });
        return memoryCache;
    }

    if (!canUseWebStorage()) {
        memoryCache = null;
        return memoryCache;
    }

    try {
        const raw = window.localStorage.getItem(DESKTOP_AUTH_STORAGE_KEY);
        if (!raw) {
            logDesktopAuthDebug("web desktop auth fallback storage is empty");
            memoryCache = null;
            return memoryCache;
        }

        const parsed = JSON.parse(raw) as unknown;
        memoryCache = isStoredDesktopAuthSession(parsed) ? parsed : null;
        logDesktopAuthDebug("loaded desktop auth session from web storage fallback", {
            present: Boolean(memoryCache),
            hasJwt: Boolean(memoryCache?.jwt),
            userId: memoryCache?.data.user.id ?? null,
        });
        return memoryCache;
    } catch {
        memoryCache = null;
        return memoryCache;
    }
}

export async function writeDesktopAuthSession(session: StoredDesktopAuthSession): Promise<void> {
    memoryCache = session;
    logDesktopAuthDebug("writing desktop auth session", {
        hasJwt: Boolean(session.jwt),
        userId: session.data.user.id,
    });

    const adapter = await getStorageAdapter();
    if (adapter) {
        try {
            if (session.jwt) {
                const storedSecret = await writeDesktopSecureSecret(DESKTOP_AUTH_JWT_SECRET_KEY, session.jwt);
                if (!storedSecret) {
                    throw new Error("Secure desktop credential storage is unavailable.");
                }
            } else {
                await clearDesktopSecureSecret(DESKTOP_AUTH_JWT_SECRET_KEY);
            }

            await adapter.set(DESKTOP_AUTH_STORAGE_KEY, {
                data: session.data,
                persistedAt: session.persistedAt,
            });
            logDesktopAuthDebug("persisted desktop auth session to native store", {
                userId: session.data.user.id,
            });
            emitDesktopAuthSessionChange(session);
            return;
        } catch {
            await adapter.del(DESKTOP_AUTH_STORAGE_KEY).catch(() => undefined);
            await clearDesktopSecureSecret(DESKTOP_AUTH_JWT_SECRET_KEY);
            memoryCache = null;
            console.error("[cadence:desktop-auth] failed to persist desktop auth session to native store");
            throw new Error("Cadence could not persist the desktop auth session securely.");
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
    logDesktopAuthDebug("clearing desktop auth session");

    const adapter = await getStorageAdapter();
    if (adapter) {
        await adapter.del(DESKTOP_AUTH_STORAGE_KEY);
        await clearDesktopSecureSecret(DESKTOP_AUTH_JWT_SECRET_KEY);
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