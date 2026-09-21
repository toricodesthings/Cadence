import { useSyncExternalStore } from "react";
import { getNativeStore, getWebStorage, IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { createExternalStore } from "../../lib/utils/external-store";

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
let loadPromise: Promise<void> | null = null;
const preferencesStore = createExternalStore(DEFAULT_DESKTOP_COMMAND_PREFERENCES);

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

    const fallbackStorage = getWebStorage();
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

    getWebStorage()?.setItem(DESKTOP_COMMAND_PREFERENCES_FALLBACK_KEY, JSON.stringify(nextPreferences));
}

async function ensureLoaded() {
    if (loaded) {
        return;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const stored = await readPreferences();
            loaded = true;
            preferencesStore.set(stored);
        })();
    }

    await loadPromise;
}

function subscribe(listener: () => void) {
    void ensureLoaded();
    return preferencesStore.subscribe(listener);
}

function getSnapshot() {
    void ensureLoaded();
    return preferencesStore.get();
}

function getServerSnapshot() {
    return DEFAULT_DESKTOP_COMMAND_PREFERENCES;
}

async function updateDesktopCommandPreferences(patch: Partial<DesktopCommandPreferences>) {
    await ensureLoaded();
    const next = { ...preferencesStore.get(), ...patch };
    loaded = true;
    preferencesStore.set(next);
    await persistPreferences(next);
}

export function useDesktopCommandPreferences() {
    const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        preferences,
        updatePreferences: updateDesktopCommandPreferences,
    };
}