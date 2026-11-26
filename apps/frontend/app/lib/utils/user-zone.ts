import { useSyncExternalStore } from "react";
import { addDays, isZone, startOfDay, todayIn, type LocalDate, type Zone } from "@cadence/domain/time";
import { createExternalStore } from "./external-store";

export function deviceZone(): Zone {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isZone(zone) ? zone : "UTC";
    } catch {
        return "UTC";
    }
}

export function resolveZone(setting: string | undefined): Zone {
    return isZone(setting) ? setting : deviceZone();
}

const zoneStore = createExternalStore<Zone>(deviceZone());
const todayStore = createExternalStore<LocalDate>(todayIn(zoneStore.get()));

export const getUserZone = (): Zone => zoneStore.get();

export const today = (): LocalDate => todayIn(zoneStore.get());

export function setUserZone(zone: Zone) {
    if (zone === zoneStore.get()) return;
    zoneStore.set(zone);
    refreshToday();
}

function refreshToday() {
    todayStore.set(todayIn(zoneStore.get()));
}

let midnightTimer: ReturnType<typeof setTimeout> | undefined;
function armMidnight() {
    clearTimeout(midnightTimer);
    const zone = zoneStore.get();
    const next = Date.parse(startOfDay(addDays(todayIn(zone), 1), zone)) - Date.now();
    midnightTimer = setTimeout(
        () => {
            refreshToday();
            armMidnight();
        },
        Math.max(1_000, next + 500),
    );
}

function subscribeToday(listener: () => void) {
    if (midnightTimer === undefined) armMidnight();
    const unsubscribe = todayStore.subscribe(listener);
    const onVisible = () => {
        if (document.visibilityState === "visible") {
            refreshToday();
            armMidnight();
        }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
        unsubscribe();
        document.removeEventListener("visibilitychange", onVisible);
    };
}

export function useUserZone(): Zone {
    return useSyncExternalStore(zoneStore.subscribe, zoneStore.get, zoneStore.get);
}

export function useToday(): LocalDate {
    return useSyncExternalStore(subscribeToday, todayStore.get, todayStore.get);
}
