import { useSyncExternalStore } from "react";
import type { AvailableAppUpdate } from "./runtime";

let availableUpdate: AvailableAppUpdate | null = null;

const subscribers = new Set<() => void>();

function emitChange() {
    subscribers.forEach((listener) => {
        listener();
    });
}

export function publishAvailableDesktopUpdate(update: AvailableAppUpdate | null) {
    availableUpdate = update;
    emitChange();
}

function subscribe(listener: () => void) {
    subscribers.add(listener);
    return () => {
        subscribers.delete(listener);
    };
}

function getSnapshot() {
    return availableUpdate;
}

function getServerSnapshot() {
    return null;
}

export function useAvailableDesktopUpdate() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}