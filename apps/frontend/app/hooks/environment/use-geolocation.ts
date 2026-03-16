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

let sharedGeolocationState: SharedGeolocationState = {
    permissionState: "prompt",
    preciseLocation: null,
    coordinates: null,
    isLocating: false,
    refreshedAt: null,
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
    const url = `${API_BASE_URL}/api/proxy/geocode/reverse?latitude=${latitude}&longitude=${longitude}`;
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
                updateSharedGeolocationState({
                    coordinates: {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    },
                    preciseLocation: resolved,
                    permissionState: "granted",
                    refreshedAt: new Date().toISOString(),
                });
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
        }, []),
    };
}
