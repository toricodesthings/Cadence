import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ApproximatePlace } from "@cadence/contracts/proxy";
import type { LocationMode, SavedCity } from "@cadence/contracts/settings";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { useAuthState } from "../auth/use-auth-state";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import {
    DEVICE_LOCATION_REFRESH_MS,
    bindDeviceLocationUser,
    forgetDevicePlace,
    getDeviceLocationSnapshot,
    requestDeviceLocation,
    subscribeDeviceLocation,
    watchDevicePermission,
    type Coordinates,
    type DeviceLocationResult,
    type RegionInfo,
} from "../../lib/location/device-location";

export type { LocationMode };
export type LocationSource = "precise" | "approximate" | "manual";

export interface ResolvedPlace extends RegionInfo {
    source: LocationSource;
    city: string | null;
    coordinates: Coordinates | null;
}

interface ManualLocationPatch {
    countryCode?: string | null;
    subdivisionCode?: string | null;
    city?: SavedCity | null;
}

const APPROXIMATE_STALE_MS = 6 * 60 * 60 * 1000;
const APPROXIMATE_GC_MS = 24 * 60 * 60 * 1000;

/**
 * The one answer to "where is the user", shared by weather, holidays, and the
 * Location settings tab.
 *
 * Nothing leaves the device until the server copy of settings has loaded, so an
 * empty or stale local cache can never trigger a lookup the user turned off. The
 * browser permission prompt only ever appears from `setMode("precise")` or
 * `requestPrecise()`, which the UI calls from a click.
 */
export function useUserLocation() {
    const { data: settings, isFetched: settingsFetched } = useSettings();
    const updateSettings = useUpdateSettings();
    const client = useApiClient();
    const queryClient = useQueryClient();
    const { session } = useAuthState();
    const userId = session?.user.id ?? null;

    const saved = settings?.location;
    const ready = settingsFetched && Boolean(saved);
    const mode: LocationMode = saved?.mode ?? "approximate";

    const device = useSyncExternalStore(subscribeDeviceLocation, getDeviceLocationSnapshot, getDeviceLocationSnapshot);

    useEffect(() => {
        watchDevicePermission();
    }, []);

    useEffect(() => {
        bindDeviceLocationUser(userId);
    }, [userId]);

    const lookupRegion = useCallback(async (coordinates: Coordinates) => {
        const response = await client.api.proxy.geocode.reverse.$get({
            query: { latitude: String(coordinates.latitude), longitude: String(coordinates.longitude) },
        });
        return unwrapResponse<RegionInfo>(response);
    }, [client]);

    const requestPrecise = useCallback(
        (): Promise<DeviceLocationResult> => requestDeviceLocation(lookupRegion),
        [lookupRegion],
    );

    // Precise mode refreshes quietly, and only while the browser already grants
    // the permission. It never raises the prompt by itself.
    useEffect(() => {
        if (!ready || mode !== "precise") return;
        if (device.permissionState !== "granted" || device.isLocating || device.failed) return;
        const age = device.refreshedAt ? Date.now() - new Date(device.refreshedAt).getTime() : Number.POSITIVE_INFINITY;
        if (device.place && age < DEVICE_LOCATION_REFRESH_MS) return;
        void requestPrecise();
    }, [ready, mode, device.permissionState, device.isLocating, device.failed, device.place, device.refreshedAt, requestPrecise]);

    // Precise mode leans on the approximate location whenever the device can't
    // (or won't) answer, instead of asking again.
    const preciseFallback = mode === "precise"
        && !device.place
        && device.permissionState !== "unknown"
        && (device.permissionState !== "granted" || device.failed);
    const needsApproximate = ready && (mode === "approximate" || preciseFallback);

    const approximateQuery = useQuery({
        queryKey: queryKeys.location.approximate(userId),
        queryFn: async () => unwrapResponse<ApproximatePlace>(await client.api.proxy.geo.approximate.$get()),
        enabled: needsApproximate && userId !== null,
        staleTime: APPROXIMATE_STALE_MS,
        gcTime: APPROXIMATE_GC_MS,
        refetchOnWindowFocus: false,
        retry: 1,
        meta: { persist: false },
    });

    const place = useMemo<ResolvedPlace | null>(() => {
        if (!ready || !saved || mode === "off") return null;

        if (mode === "manual") {
            if (!saved.countryCode && !saved.city) return null;
            return {
                source: "manual",
                countryCode: saved.countryCode,
                subdivisionCode: saved.subdivisionCode,
                subdivisionName: null,
                city: saved.city?.name ?? null,
                coordinates: saved.city ? { latitude: saved.city.latitude, longitude: saved.city.longitude } : null,
            };
        }

        if (mode === "precise" && device.place) {
            return { source: "precise", ...device.place, city: null };
        }

        if (needsApproximate && approximateQuery.data) {
            return { source: "approximate", ...approximateQuery.data };
        }

        return null;
    }, [ready, saved, mode, device.place, needsApproximate, approximateQuery.data]);

    const isResolving = !ready
        || (mode === "precise" && !device.place && !preciseFallback)
        || (needsApproximate && approximateQuery.isLoading);

    const refreshedAt = place?.source === "precise"
        ? device.refreshedAt
        : place?.source === "approximate" && approximateQuery.dataUpdatedAt
            ? new Date(approximateQuery.dataUpdatedAt).toISOString()
            : null;

    // Every explicit choice also records the dismissal, so the one-time notice
    // can never come back after the user has decided something.
    const saveLocation = useCallback(async (patch: { mode?: LocationMode } & ManualLocationPatch) => {
        try {
            await updateSettings.mutateAsync({
                location: {
                    ...patch,
                    promptDismissedAt: saved?.promptDismissedAt ?? new Date().toISOString(),
                },
            });
            return true;
        } catch {
            toast.error("Couldn’t save your location choice.");
            return false;
        }
    }, [saved?.promptDismissedAt, updateSettings]);

    const setMode = useCallback(async (next: LocationMode) => {
        if (next !== "precise") forgetDevicePlace();
        // Start the device request before awaiting the save so the permission
        // prompt stays attached to the click that asked for it.
        const request = next === "precise" ? requestPrecise() : null;
        await saveLocation({ mode: next });
        return request ? request : null;
    }, [requestPrecise, saveLocation]);

    const setManualLocation = useCallback(
        (patch: ManualLocationPatch) => saveLocation({ mode: "manual", ...patch }),
        [saveLocation],
    );

    const dismissPrompt = useCallback(() => saveLocation({}), [saveLocation]);

    const forgetLocation = useCallback(() => {
        forgetDevicePlace();
        queryClient.removeQueries({ queryKey: queryKeys.location.all });
        queryClient.removeQueries({ queryKey: queryKeys.weather.all });
    }, [queryClient]);

    return {
        ready,
        mode,
        place,
        isResolving,
        refreshedAt,
        preciseFallback,
        permissionState: device.permissionState,
        isLocating: device.isLocating,
        preciseFailed: device.failed,
        manualCountryCode: saved?.countryCode ?? null,
        manualSubdivisionCode: saved?.subdivisionCode ?? null,
        savedCity: saved?.city ?? null,
        shouldShowPrompt: ready && mode === "approximate" && !saved?.promptDismissedAt,
        setMode,
        requestPrecise,
        setManualLocation,
        dismissPrompt,
        forgetLocation,
    };
}
