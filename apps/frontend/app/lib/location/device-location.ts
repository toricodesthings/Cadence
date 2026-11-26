import type { Coordinates, RegionInfo } from "@cadence/contracts/proxy";

export type { Coordinates, RegionInfo };

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

export const DEVICE_LOCATION_REFRESH_MS = 6 * 60 * 60 * 1000;

const POSITION_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    timeout: 10_000,
    maximumAge: 30 * 60 * 1000,
};

const PERMISSION_DENIED = 1;

export function roundCoordinate(value: number) {
    return Math.round(value * 100) / 100;
}

const EMPTY_PLACE_STATE = { place: null, refreshedAt: null, isLocating: false, failed: false } as const;

let state: DeviceLocationState = { permissionState: "unknown", ...EMPTY_PLACE_STATE };
let boundUserId: string | null = null;
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
    } catch {}
}

export function bindDeviceLocationUser(userId: string | null) {
    if (userId === boundUserId) return;
    boundUserId = userId;
    generation += 1;
    inflight = null;
    try {
        localStorage.removeItem(LEGACY_CACHE_KEY);
    } catch {}
    const cached = userId ? readCache(userId) : null;
    setState({ ...EMPTY_PLACE_STATE, place: cached?.place ?? null, refreshedAt: cached?.refreshedAt ?? null });
}

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

    navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
            const apply = () => {
                const next = status.state as DevicePermissionState;
                if (next !== "granted" && state.place) forgetDevicePlace();
                setState({ permissionState: next });
            };
            apply();
            status.onchange = apply;
        })
        .catch(() => {
            setState({ permissionState: "prompt" });
        });
}

function getCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, POSITION_OPTIONS);
    });
}

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

export function forgetDevicePlace() {
    generation += 1;
    inflight = null;
    if (boundUserId) {
        try {
            localStorage.removeItem(cacheKey(boundUserId));
        } catch {}
    }
    setState({ ...EMPTY_PLACE_STATE });
}

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
    } catch {}
    setState({ ...EMPTY_PLACE_STATE });
}
