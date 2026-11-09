import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createExternalStore } from "../lib/utils/external-store";
import { CADENCE_VERSION } from "../lib/constants/app-info";
import type { AvailableAppUpdate } from "./runtime";

const UPDATING_KEY = "cadence:updating-to";

/** Remembers the version being installed so the relaunched app can confirm it landed. */
export function markUpdating(version: string | null) {
    try {
        if (version) localStorage.setItem(UPDATING_KEY, version);
        else localStorage.removeItem(UPDATING_KEY);
    } catch { /* storage blocked: the confirmation is a nicety */ }
}

/** After an update restart, says once that it worked. */
export function confirmDesktopUpdate(openChangelog: () => void) {
    let target: string | null = null;
    try {
        target = localStorage.getItem(UPDATING_KEY);
        localStorage.removeItem(UPDATING_KEY);
    } catch { return; }
    if (target !== CADENCE_VERSION) return;
    toast.success(`Cadence updated to ${CADENCE_VERSION}.`, {
        action: { label: "What’s new", onClick: openChangelog },
    });
}

const updateStore = createExternalStore<AvailableAppUpdate | null>(null);
const lastCheckedStore = createExternalStore<Date | null>(null);

/** Records the result of a completed update check (`null` = up to date) and stamps when it finished. */
export function publishAvailableDesktopUpdate(update: AvailableAppUpdate | null) {
    updateStore.set(update);
    lastCheckedStore.set(new Date());
}

/** The one nudge for a found update; the details live in Settings > About. */
export function announceDesktopUpdate(update: AvailableAppUpdate) {
    toast.info(`Cadence ${update.version} is ready to install.`, {
        description: "Open Settings > About Cadence to review release notes and apply the update.",
    });
}

export function useAvailableDesktopUpdate() {
    return useSyncExternalStore(updateStore.subscribe, updateStore.get, () => null);
}

export function useLastUpdateCheck() {
    return useSyncExternalStore(lastCheckedStore.subscribe, lastCheckedStore.get, () => null);
}
