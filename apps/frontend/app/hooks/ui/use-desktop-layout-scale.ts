import { useSyncExternalStore } from "react";
import { getNativeStore, getWebStorage, IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { createExternalStore } from "../../lib/utils/external-store";

/** Layout scale as a percentage of the normal size. */
export type DesktopLayoutScale = number;

const DESKTOP_LAYOUT_SCALE_STORE = "cadence_desktop_preferences";
const DESKTOP_LAYOUT_SCALE_KEY = "layout_scale";
const DESKTOP_LAYOUT_SCALE_STORAGE_KEY = "cadence:desktop-layout-scale";

export const DESKTOP_LAYOUT_SCALE_DEFAULT: DesktopLayoutScale = 100;
export const DESKTOP_LAYOUT_SCALES: readonly DesktopLayoutScale[] = [75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 135, 150];

/** Names saved before the scale became a percentage. */
const LEGACY_SCALES: Record<string, DesktopLayoutScale> = { compact: 95, default: 100, comfortable: 110, large: 115 };

let loaded = false;
let loadPromise: Promise<void> | null = null;
const scaleStore = createExternalStore<DesktopLayoutScale>(DESKTOP_LAYOUT_SCALE_DEFAULT);

function parsePersistedScale(value: unknown): DesktopLayoutScale | null {
    if (typeof value === "string" && value in LEGACY_SCALES) return LEGACY_SCALES[value];
    const scale = Number(value);
    return DESKTOP_LAYOUT_SCALES.includes(scale) ? scale : null;
}

async function readPersistedScale() {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_LAYOUT_SCALE_STORE).catch(() => null);
        if (store) {
            return parsePersistedScale(await store.get<unknown>(DESKTOP_LAYOUT_SCALE_KEY));
        }
    }

    return parsePersistedScale(getWebStorage()?.getItem(DESKTOP_LAYOUT_SCALE_STORAGE_KEY) ?? null);
}

async function persistScale(scale: DesktopLayoutScale) {
    if (IS_DESKTOP_RUNTIME) {
        const store = await getNativeStore(DESKTOP_LAYOUT_SCALE_STORE).catch(() => null);
        if (store) {
            await store.set(DESKTOP_LAYOUT_SCALE_KEY, scale);
            return;
        }
    }

    getWebStorage()?.setItem(DESKTOP_LAYOUT_SCALE_STORAGE_KEY, String(scale));
}

async function ensureLoaded() {
    if (loaded) {
        return;
    }

    if (!loadPromise) {
        loadPromise = (async () => {
            const stored = await readPersistedScale();
            loaded = true;
            scaleStore.set(stored ?? DESKTOP_LAYOUT_SCALE_DEFAULT);
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
    return DESKTOP_LAYOUT_SCALE_DEFAULT;
}

async function setDesktopLayoutScale(nextScale: DesktopLayoutScale) {
    loaded = true;
    scaleStore.set(nextScale);
    await persistScale(nextScale);
}

async function stepDesktopLayoutScale(direction: 1 | -1) {
    await ensureLoaded();

    const currentIndex = DESKTOP_LAYOUT_SCALES.indexOf(scaleStore.get());
    const nextIndex = Math.max(0, Math.min(DESKTOP_LAYOUT_SCALES.length - 1, currentIndex + direction));
    await setDesktopLayoutScale(DESKTOP_LAYOUT_SCALES[nextIndex]);
}

export function useDesktopLayoutScale() {
    const layoutScale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    return {
        layoutScale,
        setLayoutScale: setDesktopLayoutScale,
        stepLayoutScale: stepDesktopLayoutScale,
        scaleFactor: layoutScale / 100,
    };
}