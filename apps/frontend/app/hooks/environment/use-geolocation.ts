import { useCallback, useEffect, useState } from "react";
import {
    normalizeCountryCode,
    type PreciseHolidayLocation,
} from "../../lib/holidays/location-resolver";

export type GeolocationPermissionState = "prompt" | "granted" | "denied" | "unsupported";
export type PreciseLocationRequestStatus = "granted" | "denied" | "error" | "unsupported";

export interface PreciseLocationRequestResult {
    status: PreciseLocationRequestStatus;
    location: PreciseHolidayLocation | null;
}

interface ReverseGeocodeResponse {
    address?: {
        country_code?: string;
        state?: string;
        region?: string;
        county?: string;
    };
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
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));
    url.searchParams.set("zoom", "5");
    url.searchParams.set("addressdetails", "1");

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Reverse geocoding failed with status ${response.status}`);
    }

    const payload = await response.json() as ReverseGeocodeResponse;
    const address = payload.address;

    return {
        countryCode: normalizeCountryCode(address?.country_code ?? null),
        subdivisionName: address?.state ?? address?.region ?? address?.county ?? null,
    };
}

export function useGeolocation({ onDenied }: { onDenied?: () => void } = {}) {
    const [permissionState, setPermissionState] = useState<GeolocationPermissionState>("prompt");
    const [preciseLocation, setPreciseLocation] = useState<PreciseHolidayLocation | null>(null);
    const [isLocating, setIsLocating] = useState(false);

    useEffect(() => {
        void getGeolocationPermissionState().then(setPermissionState);
    }, []);

    const resolvePreciseLocation = useCallback(async (): Promise<PreciseLocationRequestResult> => {
        if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
            setPermissionState("unsupported");
            return { status: "unsupported", location: null };
        }

        setIsLocating(true);

        try {
            const position = await requestCurrentPosition();
            const resolved = await reverseGeocodeLocation(position.coords.latitude, position.coords.longitude);
            setPreciseLocation(resolved);
            setPermissionState("granted");
            return { status: "granted", location: resolved };
        } catch (error) {
            const geolocationError = error as GeolocationPositionError;
            if (geolocationError?.code === 1) {
                setPermissionState("denied");
                onDenied?.();
                return { status: "denied", location: null };
            }
            return { status: "error", location: null };
        } finally {
            setIsLocating(false);
        }
    }, [onDenied]);

    return {
        permissionState,
        preciseLocation,
        isLocating,
        resolvePreciseLocation,
        clearPreciseLocation: useCallback(() => setPreciseLocation(null), []),
    };
}
