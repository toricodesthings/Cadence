import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
    normalizeCountryCode,
    type PreciseHolidayLocation,
} from "../../lib/holidays/location-resolver";
import { authenticatedFetch } from "../../lib/api/client";
import { API_BASE_URL } from "../../lib/env";

export type GeolocationPermissionState = "prompt" | "granted" | "denied" | "unsupported";
export type PreciseLocationRequestStatus = "granted" | "denied" | "error" | "unsupported";

export interface PreciseLocationRequestResult {
    status: PreciseLocationRequestStatus;
    location: PreciseHolidayLocation | null;
}

interface SharedGeolocationState {
    permissionState: GeolocationPermissionState;
    preciseLocation: PreciseHolidayLocation | null;
    coordinates: { latitude: number; longitude: number } | null;
    isLocating: boolean;
    refreshedAt: string | null;
}

const STORAGE_KEY = "cadence:geolocation-cache";
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface CachedGeolocation {
    coordinates: { latitude: number; longitude: number };
    preciseLocation: PreciseHolidayLocation;
    refreshedAt: string;
}

function loadCachedGeolocation(): CachedGeolocation | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedGeolocation;
        if (!parsed.coordinates || !parsed.preciseLocation || !parsed.refreshedAt) return null;
        // Check staleness
        const age = Date.now() - new Date(parsed.refreshedAt).getTime();
        if (age > CACHE_MAX_AGE_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveCachedGeolocation(data: CachedGeolocation) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
        // localStorage full or unavailable — silently ignore
    }
}

const cached = loadCachedGeolocation();

let sharedGeolocationState: SharedGeolocationState = {
    permissionState: "prompt",
    preciseLocation: cached?.preciseLocation ?? null,
    coordinates: cached?.coordinates ?? null,
    isLocating: false,
    refreshedAt: cached?.refreshedAt ?? null,
};

let inflightLocationRequest: Promise<PreciseLocationRequestResult> | null = null;
const subscribers = new Set<() => void>();

function emitGeolocationChange() {
    subscribers.forEach((listener) => listener());
}

function updateSharedGeolocationState(
    nextState: Partial<SharedGeolocationState> | ((current: SharedGeolocationState) => Partial<SharedGeolocationState>),
) {
    const patch = typeof nextState === "function" ? nextState(sharedGeolocationState) : nextState;
    sharedGeolocationState = {
        ...sharedGeolocationState,
        ...patch,
    };
    emitGeolocationChange();
}

function subscribeToSharedGeolocation(listener: () => void) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
}

async function getGeolocationPermissionState(): Promise<GeolocationPermissionState> {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        return "unsupported";
    }

    if (!("permissions" in navigator) || !navigator.permissions?.query) {
        return "prompt";
    }

    try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "granted" || status.state === "prompt" || status.state === "denied") {
            return status.state;
        }
    } catch {
        return "prompt";
    }

    return "prompt";
}

function requestCurrentPosition() {
    return new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10_000,
            maximumAge: 300_000,
        });
    });
}

async function reverseGeocodeLocation(latitude: number, longitude: number): Promise<PreciseHolidayLocation> {
    const url = `${API_BASE_URL}/api/v1/proxy/geocode/reverse?latitude=${latitude}&longitude=${longitude}`;
    const response = await authenticatedFetch(url, { authenticated: true });

    if (!response.ok) {
        throw new Error(`Reverse geocoding failed with status ${response.status}`);
    }

    const payload = await response.json() as { data: { countryCode: string | null; subdivisionName: string | null } };

    return {
        countryCode: normalizeCountryCode(payload.data.countryCode),
        subdivisionName: payload.data.subdivisionName,
    };
}

export function useGeolocation({ onDenied }: { onDenied?: () => void } = {}) {
    const snapshot = useSyncExternalStore(
        subscribeToSharedGeolocation,
        () => sharedGeolocationState,
        () => sharedGeolocationState,
    );

    useEffect(() => {
        void getGeolocationPermissionState().then((permissionState) => {
            updateSharedGeolocationState({ permissionState });
        });
    }, []);

    const resolvePreciseLocation = useCallback(async (): Promise<PreciseLocationRequestResult> => {
        if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
            updateSharedGeolocationState({ permissionState: "unsupported" });
            return { status: "unsupported", location: null };
        }

        if (inflightLocationRequest) {
            return inflightLocationRequest;
        }

        updateSharedGeolocationState({ isLocating: true });

        inflightLocationRequest = (async () => {
            try {
                const position = await requestCurrentPosition();
                const resolved = await reverseGeocodeLocation(position.coords.latitude, position.coords.longitude);
                const coords = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                };
                const refreshedAt = new Date().toISOString();
                updateSharedGeolocationState({
                    coordinates: coords,
                    preciseLocation: resolved,
                    permissionState: "granted",
                    refreshedAt,
                });
                saveCachedGeolocation({ coordinates: coords, preciseLocation: resolved, refreshedAt });
                return { status: "granted", location: resolved };
            } catch (error) {
                const geolocationError = error as GeolocationPositionError;
                if (geolocationError?.code === 1) {
                    updateSharedGeolocationState({
                        permissionState: "denied",
                        preciseLocation: null,
                        coordinates: null,
                    });
                    onDenied?.();
                    return { status: "denied", location: null };
                }
                return { status: "error", location: null };
            } finally {
                inflightLocationRequest = null;
                updateSharedGeolocationState({ isLocating: false });
            }
        })();

        return inflightLocationRequest;
    }, [onDenied]);

    return {
        permissionState: snapshot.permissionState,
        preciseLocation: snapshot.preciseLocation,
        coordinates: snapshot.coordinates,
        isLocating: snapshot.isLocating,
        refreshedAt: snapshot.refreshedAt,
        resolvePreciseLocation,
        clearPreciseLocation: useCallback(() => {
            updateSharedGeolocationState({
                preciseLocation: null,
                coordinates: null,
                refreshedAt: null,
            });
            try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
        }, []),
    };
}
