import { useSyncExternalStore } from "react";
import { getNativeStore, IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { createExternalStore } from "../../lib/utils/external-store";

const PREFERENCES_STORE = "cadence_desktop_preferences";
const BACKGROUND_KEY = "backgroundDelivery";

let loaded = false;
let loadPromise: Promise<void> | null = null;
const backgroundStore = createExternalStore(false);

async function readPersisted(): Promise<boolean> {
    if (!IS_DESKTOP_RUNTIME) return false;
    const store = await getNativeStore(PREFERENCES_STORE).catch(() => null);
    return (await store?.get<boolean>(BACKGROUND_KEY)) ?? false;
}

async function ensureLoaded() {
    if (loaded) return;
    if (!loadPromise) {
        loadPromise = (async () => {
            const stored = await readPersisted();
            loaded = true;
            backgroundStore.set(stored);
        })();
    }
    await loadPromise;
}

function subscribe(listener: () => void) {
    void ensureLoaded();
    return backgroundStore.subscribe(listener);
}

function getSnapshot() {
    void ensureLoaded();
    return backgroundStore.get();
}

/**
 * Windows only: keep Cadence running in the tray after the window closes, with autostart on
 * login so the server can still reach this device. Rust reads this preference once at launch
 * (never live), so a change only takes effect the next time Cadence opens — the tray icon is
 * the only way back, and it must never appear without having been there since startup.
 */
export async function setBackgroundDelivery(enabled: boolean): Promise<void> {
    loaded = true;
    backgroundStore.set(enabled);
    const store = await getNativeStore(PREFERENCES_STORE).catch(() => null);
    await store?.set(BACKGROUND_KEY, enabled);
    const autostart = await import("@tauri-apps/plugin-autostart");
    await (enabled ? autostart.enable() : autostart.disable()).catch(() => {});
}

export function useDesktopBackgroundDelivery() {
    const enabled = useSyncExternalStore(subscribe, getSnapshot, () => false);
    return { enabled, setEnabled: setBackgroundDelivery };
}
