import { useSyncExternalStore } from "react";
import { getNativeStore, IS_DESKTOP_RUNTIME } from "../../platform/runtime";

interface DesktopCommandPreferences {
    quickCaptureShortcutEnabled: boolean;
}

const DESKTOP_COMMAND_STORE = "cadence_desktop_preferences";
const DESKTOP_COMMAND_PREFERENCES_KEY = "command_preferences";
const DESKTOP_COMMAND_PREFERENCES_FALLBACK_KEY = "cadence:desktop-command-preferences";

const DEFAULT_DESKTOP_COMMAND_PREFERENCES: DesktopCommandPreferences = {
    quickCaptureShortcutEnabled: false,
};

let loaded = false;
let currentPreferences: DesktopCommandPreferences = DEFAULT_DESKTOP_COMMAND_PREFERENCES;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function emitChange() {
    subscribers.forEach((listener) => {
        listener();
    });
}

function getFallbackStorage() {
    if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
        return null;
    }

    return window.localStorage;
}

function isDesktopCommandPreferences(value: unknown): value is DesktopCommandPreferences {
    if (!value || typeof value !== "object") {
        return false;
    }

    const prefs = value as Record<string, unknown>;
    return typeof prefs.quickCaptureShortcutEnabled === "boolean";
}

async function readPreferences() {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_COMMAND_STORE).catch(() => null);
        if (store) {
            const stored = await store.get<unknown>(DESKTOP_COMMAND_PREFERENCES_KEY);
            if (isDesktopCommandPreferences(stored)) {
                return stored;
            }
        }
    }

    const fallbackStorage = getFallbackStorage();
    if (!fallbackStorage) {
        return DEFAULT_DESKTOP_COMMAND_PREFERENCES;
    }

    try {
        const raw = fallbackStorage.getItem(DESKTOP_COMMAND_PREFERENCES_FALLBACK_KEY);
        if (!raw) {
            return DEFAULT_DESKTOP_COMMAND_PREFERENCES;
        }

        const parsed = JSON.parse(raw) as unknown;
        return isDesktopCommandPreferences(parsed) ? parsed : DEFAULT_DESKTOP_COMMAND_PREFERENCES;
    } catch {
        return DEFAULT_DESKTOP_COMMAND_PREFERENCES;
    }
}

async function persistPreferences(nextPreferences: DesktopCommandPreferences) {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_COMMAND_STORE).catch(() => null);
        if (store) {
            await store.set(DESKTOP_COMMAND_PREFERENCES_KEY, nextPreferences);
            return;
        }
    }

    getFallbackStorage()?.setItem(DESKTOP_COMMAND_PREFERENCES_FALLBACK_KEY, JSON.stringify(nextPreferences));
}

async function ensureLoaded() {
    if (loaded) {
        return;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            currentPreferences = await readPreferences();
            loaded = true;
            emitChange();
        })();
    }

    await loadPromise;
}

function subscribe(listener: () => void) {
    subscribers.add(listener);
    void ensureLoaded();

    return () => {
        subscribers.delete(listener);
    };
}

function getSnapshot() {
    void ensureLoaded();
    return currentPreferences;
}

function getServerSnapshot() {
    return DEFAULT_DESKTOP_COMMAND_PREFERENCES;
}

export async function updateDesktopCommandPreferences(patch: Partial<DesktopCommandPreferences>) {
    await ensureLoaded();
    currentPreferences = {
        ...currentPreferences,
        ...patch,
    };
    loaded = true;
    emitChange();
    await persistPreferences(currentPreferences);
}

export function useDesktopCommandPreferences() {
    const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        preferences,
        updatePreferences: updateDesktopCommandPreferences,
    };
}