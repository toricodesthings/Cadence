import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import { fetchHolidays, fetchHolidaySubdivisions, type HolidayRecord } from "../../lib/holidays/provider";
import {
    findSubdivisionCode,
    getCountryLabel,
    getLocaleRegion,
    getPreferredLocale,
    inferCountryFromTimezone,
} from "../../lib/holidays/location-resolver";
import { useUserLocation } from "./use-user-location";

/** Where the holiday region came from, shown next to it in settings. */
export type HolidayRegionSource = "precise" | "approximate" | "manual" | "timezone" | "locale";

const DAY_MS = 24 * 60 * 60 * 1000;

function getBrowserTimeZone(settingsTimeZone: string | undefined) {
    if (settingsTimeZone && settingsTimeZone !== "local") return settingsTimeZone;
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Public holidays for a date range. The region comes from the app-wide location
 * (`useUserLocation`); this hook never asks for a location itself.
 */
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
    const location = useUserLocation();
    const locale = getPreferredLocale();
    const enabled = settings?.calendar?.holidays?.enabled ?? true;
    const place = location.place;
    const year = Number.parseInt(start.slice(0, 4), 10);

    const timeZoneCountryCode = useMemo(
        () => inferCountryFromTimezone(getBrowserTimeZone(settings?.dateTime?.timezone)),
        [settings?.dateTime?.timezone],
    );
    const localeCountryCode = useMemo(() => getLocaleRegion(locale), [locale]);

    // The resolved location wins. Without one, the device time zone says more
    // about where someone is than their language setting does.
    const countryCode = place?.countryCode ?? timeZoneCountryCode ?? localeCountryCode;
    const source: HolidayRegionSource | null = place?.countryCode
        ? place.source
        : timeZoneCountryCode ? "timezone" : localeCountryCode ? "locale" : null;

    const manualSubdivisionCode = place?.source === "manual" ? place.subdivisionCode : null;
    const needsSubdivisionMatch = Boolean(
        place
        && place.source !== "manual"
        && place.countryCode
        && (place.subdivisionCode || place.subdivisionName),
    );

    const subdivisionsQuery = useQuery({
        queryKey: ["holiday-subdivisions", countryCode, year, locale],
        queryFn: () => fetchHolidaySubdivisions(countryCode!, year, locale),
        enabled: enabled && Boolean(countryCode) && (needsSubdivisionMatch || Boolean(manualSubdivisionCode)),
        staleTime: DAY_MS,
        gcTime: 14 * DAY_MS,
    });

    const subdivisionCode = manualSubdivisionCode
        ?? (needsSubdivisionMatch ? findSubdivisionCode(subdivisionsQuery.data ?? [], place) : null);

    const holidaysQuery = useQuery({
        queryKey: ["holidays", start, end, countryCode, subdivisionCode, locale, viewMode],
        queryFn: () => fetchHolidays({
            start,
            end,
            countryCode: countryCode!,
            subdivisionCode,
            locale,
        }),
        // Wait for the location and its region match, so the calendar loads the
        // right holidays once instead of national first and regional second.
        enabled: fetchOverlay
            && enabled
            && Boolean(countryCode)
            && !location.isResolving
            && !(needsSubdivisionMatch && subdivisionsQuery.isLoading),
        staleTime: 12 * 60 * 60 * 1000,
        gcTime: 14 * DAY_MS,
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

    const countryLabel = useMemo(() => getCountryLabel(countryCode, locale), [countryCode, locale]);
    const subdivisionLabel = subdivisionCode
        ? subdivisionsQuery.data?.find((subdivision) => subdivision.code === subdivisionCode)?.label
            ?? place?.subdivisionName
            ?? subdivisionCode
        : null;
    const regionLabel = [subdivisionLabel, countryLabel].filter(Boolean).join(", ") || null;

    const setEnabled = useCallback((next: boolean) => {
        updateSettings.mutate({ calendar: { holidays: { enabled: next } } });
    }, [updateSettings]);

    return {
        enabled,
        holidays: holidaysQuery.data ?? [],
        holidaysByDate,
        holidayDateSet,
        holidaysLoading: holidaysQuery.isLoading,
        countryCode,
        subdivisionCode,
        subdivisionLabel,
        regionLabel,
        source,
        setEnabled,
    };
}
