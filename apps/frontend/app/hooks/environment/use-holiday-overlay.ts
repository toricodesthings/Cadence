import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { toast } from "sonner";
import {
    fetchHolidays,
    fetchHolidayCountries,
    fetchHolidaySubdivisions,
    type HolidayCountryOption,
    type HolidayRecord,
} from "../../lib/holidays/provider";
import {
    findSubdivisionCode,
    getLocaleRegion,
    getPreferredLocale,
    inferCountryFromTimezone,
    type PreciseHolidayLocation,
} from "../../lib/holidays/location-resolver";
import { useGeolocation } from "./use-geolocation";

type HolidayLocationMode = "auto" | "manual";

const DEFAULT_HOLIDAY_SETTINGS = {
    enabled: true,
    usePreciseLocation: false,
    locationMode: "auto" as HolidayLocationMode,
    countryCode: null as string | null,
    subdivisionCode: null as string | null,
    promptDismissedAt: null as string | null,
};

const HOLIDAY_PROMPT_SESSION_KEY = "cadence:schedule-holiday-prompt-dismissed";

function getBrowserTimeZone(settingsTimeZone: string | undefined) {
    if (settingsTimeZone && settingsTimeZone !== "local") return settingsTimeZone;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    const [sessionPromptDismissed, setSessionPromptDismissed] = useState(false);

    const persistHolidaySettings = useCallback(async (
        patch: Partial<typeof DEFAULT_HOLIDAY_SETTINGS>,
        { immediate = false, errorMessage = "Couldn’t save holiday settings." }: { immediate?: boolean; errorMessage?: string } = {},
    ) => {
        const payload = {
            calendar: {
                holidays: patch,
            },
        };

        try {
            if (immediate) {
                await updateSettings.mutateAsync(payload);
            } else {
                updateSettings.mutate(payload);
            }
        } catch (error) {
            toast.error(errorMessage);
            throw error;
        }
    }, [updateSettings]);

    const {
        permissionState,
        preciseLocation,
        coordinates,
        isLocating,
        refreshedAt,
        resolvePreciseLocation,
        clearPreciseLocation,
    } = useGeolocation({
        onDenied: () => {
            void persistHolidaySettings(
                { usePreciseLocation: false },
                { immediate: true, errorMessage: "Precise location was blocked, so Cadence fell back to broader holiday matching." },
            );
        },
    });

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
        }, {
            immediate: true,
            errorMessage: "Couldn’t turn on precise holiday location.",
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
        void persistHolidaySettings(
            { promptDismissedAt: new Date().toISOString() },
            { immediate: true, errorMessage: "Couldn’t save your holiday prompt preference." },
        );
    }, [persistHolidaySettings]);

    const setEnabled = useCallback((enabled: boolean) => {
        persistHolidaySettings({ enabled });
    }, [persistHolidaySettings]);

    const setLocationMode = useCallback((locationMode: HolidayLocationMode) => {
        void persistHolidaySettings({
            locationMode,
            countryCode:
                locationMode === "manual"
                    ? holidaySettings.countryCode ?? effectiveCountryCode ?? null
                    : holidaySettings.countryCode,
        }, {
            immediate: true,
            errorMessage: "Couldn’t switch the holiday location mode.",
        });
    }, [effectiveCountryCode, holidaySettings.countryCode, persistHolidaySettings]);

    const setCountryCode = useCallback((countryCode: string | null) => {
        void persistHolidaySettings({
            locationMode: "manual",
            countryCode,
            subdivisionCode: null,
            promptDismissedAt: null,
        });
    }, [persistHolidaySettings]);

    const setSubdivisionCode = useCallback((subdivisionCode: string | null) => {
        void persistHolidaySettings({
            locationMode: "manual",
            subdivisionCode,
        });
    }, [persistHolidaySettings]);

    const setUsePreciseLocation = useCallback(async (enabled: boolean) => {
        if (!enabled) {
            await persistHolidaySettings(
                { usePreciseLocation: false },
                { immediate: true, errorMessage: "Couldn’t turn off precise holiday location." },
            );
            clearPreciseLocation();
            return null;
        }

        return requestPreciseLocation();
    }, [persistHolidaySettings, requestPreciseLocation, clearPreciseLocation]);

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
        coordinates,
        refreshedAt,
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
