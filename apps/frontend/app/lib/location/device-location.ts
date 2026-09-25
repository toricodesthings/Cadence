import type { Coordinates, RegionInfo } from "@cadence/contracts/proxy";

export type { Coordinates, RegionInfo };

/**
 * Device (browser) geolocation for the `precise` location mode.
 *
 * One module-level store shared by every consumer. It follows the browser
 * permission (including changes made in the browser's site settings), resolves
 * the device position at most once at a time, and caches the result per user in
 * localStorage. It never asks the browser for a position on its own: callers
 * request it from a user action, or when the permission is already granted.
 */

export type DevicePermissionState = "unknown" | "prompt" | "granted" | "denied" | "unsupported";
export type DeviceLocationStatus = "granted" | "denied" | "unsupported" | "error";


export interface DevicePlace extends RegionInfo {
    coordinates: Coordinates;
}

export interface DeviceLocationState {
    permissionState: DevicePermissionState;
    place: DevicePlace | null;
    isLocating: boolean;
    refreshedAt: string | null;
    /** The last request timed out or the position was unavailable. */
    failed: boolean;
}

export interface DeviceLocationResult {
    status: DeviceLocationStatus;
    place: DevicePlace | null;
}

export type RegionLookup = (coordinates: Coordinates) => Promise<RegionInfo>;

const CACHE_PREFIX = "cadence:device-location:";
const LEGACY_CACHE_KEY = "cadence:geolocation-cache";
const LEGACY_PROMPT_SESSION_KEY = "cadence:schedule-holiday-prompt-dismissed";
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** A cached position older than this is re-resolved, but only while permission is granted. */
export const DEVICE_LOCATION_REFRESH_MS = 6 * 60 * 60 * 1000;

const POSITION_OPTIONS: PositionOptions = {
    // City-level accuracy is plenty for weather and holidays, and skipping GPS
    // keeps the request fast and easy on battery.
    enableHighAccuracy: false,
    timeout: 10_000,
    maximumAge: 30 * 60 * 1000,
};

const PERMISSION_DENIED = 1;

/** ~1.1 km. Coordinates are rounded before they are stored or leave the device. */
export function roundCoordinate(value: number) {
    return Math.round(value * 100) / 100;
}

const EMPTY_PLACE_STATE = { place: null, refreshedAt: null, isLocating: false, failed: false } as const;

let state: DeviceLocationState = { permissionState: "unknown", ...EMPTY_PLACE_STATE };
let boundUserId: string | null = null;
// Bumped whenever the bound user changes or the position is forgotten, so a
// request that was in flight can't write its result back afterwards.
let generation = 0;
let inflight: Promise<DeviceLocationResult> | null = null;
let permissionWatchStarted = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<DeviceLocationState>) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
}

export function subscribeDeviceLocation(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getDeviceLocationSnapshot() {
    return state;
}

function cacheKey(userId: string) {
    return `${CACHE_PREFIX}${userId}`;
}

function readCache(userId: string): { place: DevicePlace; refreshedAt: string } | null {
    try {
        const raw = localStorage.getItem(cacheKey(userId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { place?: DevicePlace; refreshedAt?: string };
        if (!parsed.place?.coordinates || typeof parsed.refreshedAt !== "string") return null;
        if (Date.now() - new Date(parsed.refreshedAt).getTime() > CACHE_MAX_AGE_MS) {
            localStorage.removeItem(cacheKey(userId));
            return null;
        }
        return { place: parsed.place, refreshedAt: parsed.refreshedAt };
    } catch {
        return null;
    }
}

function writeCache(userId: string, place: DevicePlace, refreshedAt: string) {
    try {
        localStorage.setItem(cacheKey(userId), JSON.stringify({ place, refreshedAt }));
    } catch {
        // Storage full or unavailable: the position still lives in memory.
    }
}

/** Point the store at the signed-in user: load their cached position and drop anyone else's. */
export function bindDeviceLocationUser(userId: string | null) {
    if (userId === boundUserId) return;
    boundUserId = userId;
    generation += 1;
    inflight = null;
    try {
        // The pre-0.11.1 cache wasn't scoped to a user.
        localStorage.removeItem(LEGACY_CACHE_KEY);
    } catch {
        // noop
    }
    const cached = userId ? readCache(userId) : null;
    setState({ ...EMPTY_PLACE_STATE, place: cached?.place ?? null, refreshedAt: cached?.refreshedAt ?? null });
}

/** Start following the browser permission. Safe to call from every consumer. */
export function watchDevicePermission() {
    if (permissionWatchStarted) return;
    permissionWatchStarted = true;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setState({ permissionState: "unsupported" });
        return;
    }
    if (!navigator.permissions?.query) {
        setState({ permissionState: "prompt" });
        return;
    }

    navigator.permissions.query({ name: "geolocation" }).then((status) => {
        const apply = () => {
            const next = status.state as DevicePermissionState;
            // No longer granted (revoked, reset, or "allow this time" expired): the
            // cached position goes with it.
            if (next !== "granted" && state.place) forgetDevicePlace();
            setState({ permissionState: next });
        };
        apply();
        status.onchange = apply;
    }).catch(() => {
        setState({ permissionState: "prompt" });
    });
}

function getCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, POSITION_OPTIONS);
    });
}

/**
 * Resolve the device position and name its region. While the permission is
 * still "prompt" this shows the browser's permission dialog, so call it only
 * from a user action or when the permission is already granted.
 */
export function requestDeviceLocation(lookup: RegionLookup): Promise<DeviceLocationResult> {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setState({ permissionState: "unsupported" });
        return Promise.resolve({ status: "unsupported", place: null });
    }
    if (inflight) return inflight;

    const userId = boundUserId;
    const requestGeneration = generation;
    const isCurrent = () => requestGeneration === generation;
    setState({ isLocating: true });

    const request = (async (): Promise<DeviceLocationResult> => {
        let position: GeolocationPosition;
        try {
            position = await getCurrentPosition();
        } catch (error) {
            if ((error as GeolocationPositionError | undefined)?.code === PERMISSION_DENIED) {
                if (isCurrent()) {
                    forgetDevicePlace();
                    setState({ permissionState: "denied" });
                }
                return { status: "denied", place: null };
            }
            if (isCurrent()) setState({ failed: true });
            return { status: "error", place: null };
        }

        const coordinates = {
            latitude: roundCoordinate(position.coords.latitude),
            longitude: roundCoordinate(position.coords.longitude),
        };
        let region: RegionInfo;
        try {
            region = await lookup(coordinates);
        } catch {
            // Weather still works from coordinates; holidays fall back to the time zone.
            region = { countryCode: null, subdivisionCode: null, subdivisionName: null };
        }

        const place: DevicePlace = { ...region, coordinates };
        if (!isCurrent()) return { status: "granted", place };

        const refreshedAt = new Date().toISOString();
        setState({ place, refreshedAt, permissionState: "granted", failed: false });
        if (userId) writeCache(userId, place, refreshedAt);
        return { status: "granted", place };
    })().finally(() => {
        if (inflight === request) inflight = null;
        if (isCurrent()) setState({ isLocating: false });
    });

    inflight = request;
    return request;
}

/** Forget the current user's precise position, in memory and in this device's cache. */
export function forgetDevicePlace() {
    generation += 1;
    inflight = null;
    if (boundUserId) {
        try {
            localStorage.removeItem(cacheKey(boundUserId));
        } catch {
            // noop
        }
    }
    setState({ ...EMPTY_PLACE_STATE });
}

/** Sign-out: remove every cached position on this device, for every user. */
export function clearAllDeviceLocationData() {
    generation += 1;
    inflight = null;
    boundUserId = null;
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
        }
        localStorage.removeItem(LEGACY_CACHE_KEY);
        sessionStorage.removeItem(LEGACY_PROMPT_SESSION_KEY);
    } catch {
        // noop
    }
    setState({ ...EMPTY_PLACE_STATE });
}
