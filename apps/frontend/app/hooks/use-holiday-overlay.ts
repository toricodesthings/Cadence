import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "./use-settings";
import {
    fetchHolidays,
    fetchHolidayCountries,
    fetchHolidaySubdivisions,
    type HolidayCountryOption,
    type HolidayRecord,
} from "../lib/holidays/provider";
import {
    findSubdivisionCode,
    getLocaleRegion,
    getPreferredLocale,
    inferCountryFromTimezone,
    normalizeCountryCode,
    type PreciseHolidayLocation,
} from "../lib/holidays/location-resolver";

type GeolocationPermissionState = "prompt" | "granted" | "denied" | "unsupported";
type HolidayLocationMode = "auto" | "manual";
type PreciseLocationRequestStatus = "granted" | "denied" | "error" | "unsupported";

const DEFAULT_HOLIDAY_SETTINGS = {
    enabled: true,
    usePreciseLocation: false,
    locationMode: "auto" as HolidayLocationMode,
    countryCode: null as string | null,
    subdivisionCode: null as string | null,
    promptDismissedAt: null as string | null,
};

const HOLIDAY_PROMPT_SESSION_KEY = "cadence:schedule-holiday-prompt-dismissed";

interface ReverseGeocodeResponse {
    address?: {
        country_code?: string;
        state?: string;
        region?: string;
        county?: string;
    };
}

interface PreciseLocationRequestResult {
    status: PreciseLocationRequestStatus;
    location: PreciseHolidayLocation | null;
}

function getBrowserTimeZone(settingsTimeZone: string | undefined) {
    if (settingsTimeZone && settingsTimeZone !== "local") return settingsTimeZone;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=5&addressdetails=1`,
    );

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

export function useHolidayOverlay({
    start,
    end,
    viewMode,
    fetchOverlay = true,
}: {
    start: string;
    end: string;
    viewMode: "day" | "week" | "month" | "year";
    fetchOverlay?: boolean;
}) {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const locale = getPreferredLocale();
    const holidaySettings = settings?.calendar?.holidays ?? DEFAULT_HOLIDAY_SETTINGS;
    const [permissionState, setPermissionState] = useState<GeolocationPermissionState>("prompt");
    const [preciseLocation, setPreciseLocation] = useState<PreciseHolidayLocation | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [sessionPromptDismissed, setSessionPromptDismissed] = useState(false);

    const localeCountryCode = useMemo(() => getLocaleRegion(locale), [locale]);
    const timeZoneCountryCode = useMemo(
        () => inferCountryFromTimezone(getBrowserTimeZone(settings?.dateTime?.timezone)),
        [settings?.dateTime?.timezone],
    );

    const countryOptionsQuery = useQuery({
        queryKey: ["holiday-country-options", locale],
        queryFn: () => fetchHolidayCountries(locale),
        staleTime: 1000 * 60 * 60 * 24,
        gcTime: 1000 * 60 * 60 * 24 * 14,
    });

    const autoCountryCode = preciseLocation?.countryCode ?? localeCountryCode ?? timeZoneCountryCode;
    const effectiveCountryCode =
        holidaySettings.locationMode === "manual"
            ? holidaySettings.countryCode
            : autoCountryCode;

    const subdivisionsQuery = useQuery({
        queryKey: ["holiday-subdivisions", effectiveCountryCode, start.slice(0, 4), locale],
        queryFn: () => fetchHolidaySubdivisions(effectiveCountryCode!, Number.parseInt(start.slice(0, 4), 10), locale),
        enabled: Boolean(effectiveCountryCode),
        staleTime: 1000 * 60 * 60 * 24,
        gcTime: 1000 * 60 * 60 * 24 * 14,
    });

    const autoSubdivisionCode = useMemo(() => {
        return findSubdivisionCode(subdivisionsQuery.data ?? [], preciseLocation);
    }, [preciseLocation, subdivisionsQuery.data]);

    const effectiveSubdivisionCode =
        holidaySettings.locationMode === "manual"
            ? holidaySettings.subdivisionCode
            : autoSubdivisionCode;

    const holidaysQuery = useQuery({
        queryKey: ["holidays", start, end, effectiveCountryCode, effectiveSubdivisionCode, locale, viewMode],
        queryFn: () => fetchHolidays({
            start,
            end,
            countryCode: effectiveCountryCode!,
            subdivisionCode: effectiveSubdivisionCode,
            locale,
        }),
        enabled: fetchOverlay && holidaySettings.enabled && Boolean(effectiveCountryCode),
        staleTime: 1000 * 60 * 60 * 12,
        gcTime: 1000 * 60 * 60 * 24 * 14,
    });

    const holidaysByDate = useMemo(() => {
        const map = new Map<string, HolidayRecord[]>();
        for (const holiday of holidaysQuery.data ?? []) {
            const existing = map.get(holiday.date) ?? [];
            existing.push(holiday);
            map.set(holiday.date, existing);
        }
        return map;
    }, [holidaysQuery.data]);

    const holidayDateSet = useMemo(() => new Set(holidaysByDate.keys()), [holidaysByDate]);

    const countryOptions = countryOptionsQuery.data ?? [];
    const subdivisionOptions = subdivisionsQuery.data ?? [];

    const effectiveCountryLabel = useMemo(() => {
        return countryOptions.find((country) => country.code === effectiveCountryCode)?.label ?? effectiveCountryCode ?? null;
    }, [countryOptions, effectiveCountryCode]);

    const effectiveSubdivisionLabel = useMemo(() => {
        return subdivisionOptions.find((subdivision) => subdivision.code === effectiveSubdivisionCode)?.label ?? preciseLocation?.subdivisionName ?? effectiveSubdivisionCode ?? null;
    }, [effectiveSubdivisionCode, preciseLocation?.subdivisionName, subdivisionOptions]);

    const persistHolidaySettings = useCallback((patch: Partial<typeof DEFAULT_HOLIDAY_SETTINGS>) => {
        updateSettings.mutate({
            calendar: {
                holidays: patch,
            },
        });
    }, [updateSettings]);

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
                persistHolidaySettings({
                    usePreciseLocation: false,
                });
                return { status: "denied", location: null };
            }
            return { status: "error", location: null };
        } finally {
            setIsLocating(false);
        }
    }, [persistHolidaySettings]);

    useEffect(() => {
        void getGeolocationPermissionState().then(setPermissionState);
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        setSessionPromptDismissed(window.sessionStorage.getItem(HOLIDAY_PROMPT_SESSION_KEY) === "1");
    }, []);

    useEffect(() => {
        if (
            holidaySettings.locationMode !== "auto" ||
            !holidaySettings.usePreciseLocation ||
            permissionState !== "granted"
        ) {
            return;
        }

        if (preciseLocation) return;
        void resolvePreciseLocation();
    }, [
        holidaySettings.locationMode,
        holidaySettings.usePreciseLocation,
        permissionState,
        preciseLocation,
        resolvePreciseLocation,
    ]);

    const requestPreciseLocation = useCallback(async () => {
        persistHolidaySettings({
            locationMode: "auto",
            usePreciseLocation: true,
            promptDismissedAt: null,
        });

        return resolvePreciseLocation();
    }, [persistHolidaySettings, resolvePreciseLocation]);

    const dismissPrompt = useCallback(() => {
        if (typeof window !== "undefined") {
            window.sessionStorage.setItem(HOLIDAY_PROMPT_SESSION_KEY, "1");
        }
        setSessionPromptDismissed(true);
    }, []);

    const dismissPromptPermanently = useCallback(() => {
        if (typeof window !== "undefined") {
            window.sessionStorage.setItem(HOLIDAY_PROMPT_SESSION_KEY, "1");
        }
        setSessionPromptDismissed(true);
        persistHolidaySettings({ promptDismissedAt: new Date().toISOString() });
    }, [persistHolidaySettings]);

    const setEnabled = useCallback((enabled: boolean) => {
        persistHolidaySettings({ enabled });
    }, [persistHolidaySettings]);

    const setLocationMode = useCallback((locationMode: HolidayLocationMode) => {
        persistHolidaySettings({
            locationMode,
            countryCode:
                locationMode === "manual"
                    ? holidaySettings.countryCode ?? effectiveCountryCode ?? null
                    : holidaySettings.countryCode,
        });
    }, [effectiveCountryCode, holidaySettings.countryCode, persistHolidaySettings]);

    const setCountryCode = useCallback((countryCode: string | null) => {
        persistHolidaySettings({
            locationMode: "manual",
            countryCode,
            subdivisionCode: null,
            promptDismissedAt: null,
        });
    }, [persistHolidaySettings]);

    const setSubdivisionCode = useCallback((subdivisionCode: string | null) => {
        persistHolidaySettings({
            locationMode: "manual",
            subdivisionCode,
        });
    }, [persistHolidaySettings]);

    const setUsePreciseLocation = useCallback(async (enabled: boolean) => {
        if (!enabled) {
            persistHolidaySettings({ usePreciseLocation: false });
            setPreciseLocation(null);
            return null;
        }

        return requestPreciseLocation();
    }, [persistHolidaySettings, requestPreciseLocation]);

    const shouldShowPrompt = Boolean(
        holidaySettings.enabled &&
        holidaySettings.locationMode === "auto" &&
        !holidaySettings.usePreciseLocation &&
        !holidaySettings.promptDismissedAt &&
        !sessionPromptDismissed &&
        permissionState !== "denied" &&
        permissionState !== "unsupported",
    );

    return {
        holidaySettings,
        holidays: holidaysQuery.data ?? [],
        holidaysByDate,
        holidayDateSet,
        countryOptions,
        subdivisionOptions,
        countriesLoading: countryOptionsQuery.isLoading,
        subdivisionsLoading: subdivisionsQuery.isLoading,
        holidaysLoading: holidaysQuery.isLoading,
        permissionState,
        isLocating,
        shouldShowPrompt,
        effectiveCountryCode,
        effectiveCountryLabel,
        effectiveSubdivisionCode,
        effectiveSubdivisionLabel,
        preciseLocation,
        setEnabled,
        setLocationMode,
        setCountryCode,
        setSubdivisionCode,
        setUsePreciseLocation,
        requestPreciseLocation,
        dismissPrompt,
        dismissPromptPermanently,
    };
}

export type { HolidayCountryOption };
