import { useSyncExternalStore } from "react";
import { getNativeStore, IS_DESKTOP_RUNTIME } from "../../platform/runtime";

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
let currentScale: DesktopLayoutScale = "default";
let loadPromise: Promise<void> | null = null;

const subscribers = new Set<() => void>();

function hasWindow() {
    return typeof window !== "undefined";
}

function isPersistedDesktopLayoutScale(value: unknown): value is DesktopLayoutScale {
    return value === "compact" || value === "default" || value === "comfortable" || value === "large";
}

function emitChange() {
    subscribers.forEach((listener) => {
        listener();
    });
}

async function readPersistedScale() {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_LAYOUT_SCALE_STORE).catch(() => null);
        if (store) {
            const stored = await store.get<unknown>(DESKTOP_LAYOUT_SCALE_KEY);
            return isPersistedDesktopLayoutScale(stored) ? stored : null;
        }
    }

    if (!hasWindow() || typeof window.localStorage === "undefined") {
        return null;
    }

    const raw = window.localStorage.getItem(DESKTOP_LAYOUT_SCALE_STORAGE_KEY);
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

    if (!hasWindow() || typeof window.localStorage === "undefined") {
        return;
    }

    window.localStorage.setItem(DESKTOP_LAYOUT_SCALE_STORAGE_KEY, scale);
}

async function ensureLoaded() {
    if (loaded) {
        return;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const stored = await readPersistedScale();
            currentScale = stored ?? "default";
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
    return currentScale;
}

function getServerSnapshot(): DesktopLayoutScale {
    return "default";
}

export async function setDesktopLayoutScale(nextScale: DesktopLayoutScale) {
    currentScale = nextScale;
    loaded = true;
    emitChange();
    await persistScale(nextScale);
}

export async function stepDesktopLayoutScale(direction: 1 | -1) {
    await ensureLoaded();

    const currentIndex = DESKTOP_LAYOUT_SCALE_ORDER.indexOf(currentScale);
    const nextIndex = Math.max(0, Math.min(DESKTOP_LAYOUT_SCALE_ORDER.length - 1, currentIndex + direction));
    await setDesktopLayoutScale(DESKTOP_LAYOUT_SCALE_ORDER[nextIndex]);
}

export function getDesktopLayoutScaleFactor(scale: DesktopLayoutScale) {
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