/**
 * The user's zone on the client, and today in it. `useThemeSync`'s sibling `useZoneSync` keeps the store
 * current: the pinned zone from Settings, else the device's. Pure helpers read it with `getUserZone()`;
 * components subscribe with `useUserZone()` / `useToday()` so a change (or midnight) re-renders them.
 */
import { useSyncExternalStore } from "react";
import { addDays, isZone, startOfDay, todayIn, type LocalDate, type Zone } from "@cadence/domain/time";
import { createExternalStore } from "./external-store";

/** The device's IANA zone (`UTC` if the runtime can't say). */
export function deviceZone(): Zone {
    try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return isZone(zone) ? zone : "UTC";
    } catch {
        return "UTC";
    }
}

/** Settings' `dateTime.timezone` as a zone: an IANA name pins it; anything else ("device") follows the device. */
export function resolveZone(setting: string | undefined): Zone {
    return isZone(setting) ? setting : deviceZone();
}

const zoneStore = createExternalStore<Zone>(deviceZone());
const todayStore = createExternalStore<LocalDate>(todayIn(zoneStore.get()));

export const getUserZone = (): Zone => zoneStore.get();

/** Today in the user's zone, read fresh (never stale across midnight). */
export const today = (): LocalDate => todayIn(zoneStore.get());

export function setUserZone(zone: Zone) {
    if (zone === zoneStore.get()) return;
    zoneStore.set(zone);
    refreshToday();
}

function refreshToday() {
    todayStore.set(todayIn(zoneStore.get()));
}

// One timer for the whole app: it fires just after local midnight and re-arms itself.
let midnightTimer: ReturnType<typeof setTimeout> | undefined;
function armMidnight() {
    clearTimeout(midnightTimer);
    const zone = zoneStore.get();
    const next = Date.parse(startOfDay(addDays(todayIn(zone), 1), zone)) - Date.now();
    midnightTimer = setTimeout(() => {
        refreshToday();
        armMidnight();
    }, Math.max(1_000, next + 500));
}

function subscribeToday(listener: () => void) {
    if (midnightTimer === undefined) armMidnight();
    const unsubscribe = todayStore.subscribe(listener);
    // Sleep and tab suspension can skip the timer; the day is re-read whenever the page returns.
    const onVisible = () => { if (document.visibilityState === "visible") { refreshToday(); armMidnight(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
        unsubscribe();
        document.removeEventListener("visibilitychange", onVisible);
    };
}

/** The user's zone; re-renders when it changes. */
export function useUserZone(): Zone {
    return useSyncExternalStore(zoneStore.subscribe, zoneStore.get, zoneStore.get);
}

/** Today in the user's zone; re-renders at local midnight (one app-wide timer, not one per component). */
export function useToday(): LocalDate {
    return useSyncExternalStore(subscribeToday, todayStore.get, todayStore.get);
}
