import { useSyncExternalStore } from "react";
import { getNativeStore, getWebStorage, IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { createExternalStore } from "../../lib/utils/external-store";

export type DesktopLayoutScale = "compact" | "default" | "comfortable" | "large";

const DESKTOP_LAYOUT_SCALE_STORE = "cadence_desktop_preferences";
const DESKTOP_LAYOUT_SCALE_KEY = "layout_scale";
const DESKTOP_LAYOUT_SCALE_STORAGE_KEY = "cadence:desktop-layout-scale";

const DESKTOP_LAYOUT_SCALE_VALUES: Record<DesktopLayoutScale, number> = {
    compact: 0.94,
    default: 1,
    comfortable: 1.08,
    large: 1.16,
};

const DESKTOP_LAYOUT_SCALE_ORDER: DesktopLayoutScale[] = ["compact", "default", "comfortable", "large"];

let loaded = false;
let loadPromise: Promise<void> | null = null;
const scaleStore = createExternalStore<DesktopLayoutScale>("default");

function isPersistedDesktopLayoutScale(value: unknown): value is DesktopLayoutScale {
    return value === "compact" || value === "default" || value === "comfortable" || value === "large";
}

async function readPersistedScale() {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_LAYOUT_SCALE_STORE).catch(() => null);
        if (store) {
            const stored = await store.get<unknown>(DESKTOP_LAYOUT_SCALE_KEY);
            return isPersistedDesktopLayoutScale(stored) ? stored : null;
        }
    }

    const raw = getWebStorage()?.getItem(DESKTOP_LAYOUT_SCALE_STORAGE_KEY);
    return isPersistedDesktopLayoutScale(raw) ? raw : null;
}

async function persistScale(scale: DesktopLayoutScale) {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_LAYOUT_SCALE_STORE).catch(() => null);
        if (store) {
            await store.set(DESKTOP_LAYOUT_SCALE_KEY, scale);
            return;
        }
    }

    getWebStorage()?.setItem(DESKTOP_LAYOUT_SCALE_STORAGE_KEY, scale);
}

async function ensureLoaded() {
    if (loaded) {
        return;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const stored = await readPersistedScale();
            loaded = true;
            scaleStore.set(stored ?? "default");
        })();
    }

    await loadPromise;
}

function subscribe(listener: () => void) {
    void ensureLoaded();
    return scaleStore.subscribe(listener);
}

function getSnapshot() {
    void ensureLoaded();
    return scaleStore.get();
}

function getServerSnapshot(): DesktopLayoutScale {
    return "default";
}

async function setDesktopLayoutScale(nextScale: DesktopLayoutScale) {
    loaded = true;
    scaleStore.set(nextScale);
    await persistScale(nextScale);
}

async function stepDesktopLayoutScale(direction: 1 | -1) {
    await ensureLoaded();

    const currentIndex = DESKTOP_LAYOUT_SCALE_ORDER.indexOf(scaleStore.get());
    const nextIndex = Math.max(0, Math.min(DESKTOP_LAYOUT_SCALE_ORDER.length - 1, currentIndex + direction));
    await setDesktopLayoutScale(DESKTOP_LAYOUT_SCALE_ORDER[nextIndex]);
}

function getDesktopLayoutScaleFactor(scale: DesktopLayoutScale) {
    return DESKTOP_LAYOUT_SCALE_VALUES[scale];
}

export function useDesktopLayoutScale() {
    const layoutScale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        layoutScale,
        setLayoutScale: setDesktopLayoutScale,
        stepLayoutScale: stepDesktopLayoutScale,
        scaleFactor: getDesktopLayoutScaleFactor(layoutScale),
    };
}