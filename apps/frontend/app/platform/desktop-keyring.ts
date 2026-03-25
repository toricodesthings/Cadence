import {
    deleteSecret,
    getSecret,
    setSecret,
} from "tauri-plugin-keyring-api";

const CADENCE_KEYRING_SERVICE = "com.cadence.desktop";

function hasTauriWindow() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function ensureKeyringReady() {
    return hasTauriWindow();
}

function encodeSecret(value: string) {
    return new TextEncoder().encode(value);
}

function decodeSecret(value: Uint8Array) {
    return new TextDecoder().decode(value);
}

export async function readDesktopSecureSecret(key: string): Promise<string | null> {
    if (!(await ensureKeyringReady())) {
        return null;
    }

    try {
        const secret = await getSecret(CADENCE_KEYRING_SERVICE, key);
        return secret ? decodeSecret(secret) : null;
    } catch {
        return null;
    }
}

export async function writeDesktopSecureSecret(key: string, value: string): Promise<boolean> {
    if (!(await ensureKeyringReady())) {
        return false;
    }

    try {
        await setSecret(CADENCE_KEYRING_SERVICE, key, encodeSecret(value));
        return true;
    } catch {
        return false;
    }
}

export async function clearDesktopSecureSecret(key: string): Promise<void> {
    if (!(await ensureKeyringReady())) {
        return;
    }

    try {
        await deleteSecret(CADENCE_KEYRING_SERVICE, key);
    } catch {
        // Deleting a missing secret is safe to ignore.
    }
}