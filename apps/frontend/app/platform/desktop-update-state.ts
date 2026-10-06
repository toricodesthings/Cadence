import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createExternalStore } from "../lib/utils/external-store";
import type { AvailableAppUpdate } from "./runtime";

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
