import { useSyncExternalStore } from "react";
import { createExternalStore } from "../lib/utils/external-store";
import type { AvailableAppUpdate } from "./runtime";

const updateStore = createExternalStore<AvailableAppUpdate | null>(null);

export const publishAvailableDesktopUpdate = updateStore.set;

export function useAvailableDesktopUpdate() {
    return useSyncExternalStore(updateStore.subscribe, updateStore.get, () => null);
}
