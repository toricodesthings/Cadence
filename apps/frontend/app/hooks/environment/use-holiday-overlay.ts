import { useCallback, useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useSettings, useUpdateSettings } from "../core/use-settings";
import type { HolidayRecord } from "@cadence/contracts/proxy";
import { fetchHolidays, fetchHolidaySubdivisions } from "../../lib/holidays/provider";
import {
    findSubdivisionCode,
    getCountryLabel,
    getLocaleRegion,
    getPreferredLocale,
    inferCountryFromTimezone,
} from "../../lib/holidays/location-resolver";
import { useUserLocation } from "./use-user-location";
import { queryKeys, STALE_TIMES } from "../../lib/api/query-keys";

/** Where the holiday region came from, shown next to it in settings. */
export type HolidayRegionSource = "precise" | "approximate" | "manual" | "timezone" | "locale";

export const HOLIDAY_SOURCE_LABELS: Record<HolidayRegionSource, string> = {
    precise: "from your precise location",
    approximate: "from your approximate location",
    manual: "chosen by you",
    timezone: "from your time zone",
    locale: "from your language settings",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getBrowserTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Public holidays for a date range. The region comes from the app-wide location
 * (`useUserLocation`); this hook never asks for a location itself.
 */
export function useHolidayOverlay({
    start,
    end,
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
        () => inferCountryFromTimezone(getBrowserTimeZone()),
        [],
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
        queryKey: queryKeys.holidays.subdivisions(countryCode, year, locale),
        queryFn: () => fetchHolidaySubdivisions(countryCode!, year, locale),
        enabled: enabled && Boolean(countryCode) && (needsSubdivisionMatch || Boolean(manualSubdivisionCode)),
        staleTime: STALE_TIMES.HOLIDAY_REGIONS,
        gcTime: 14 * DAY_MS,
    });

    const subdivisionCode = manualSubdivisionCode
        ?? (needsSubdivisionMatch ? findSubdivisionCode(subdivisionsQuery.data ?? [], place) : null);

    const lastYear = Number.parseInt(end.slice(0, 4), 10);
    const years = Array.from({ length: Math.max(0, lastYear - year + 1) }, (_, index) => year + index);
    // A week/month can straddle New Year. Each year has its own cache entry so
    // changing the visible range or view reuses the same regional holiday dates.
    const holidayYears = useQueries({
        queries: years.map((holidayYear) => ({
            queryKey: queryKeys.holidays.year(holidayYear, countryCode, subdivisionCode, locale),
            queryFn: () => fetchHolidays({
                start: `${holidayYear}-01-01`,
                end: `${holidayYear}-12-31`,
                countryCode: countryCode!,
                subdivisionCode,
                locale,
            }),
            // Resolve the region first, avoiding national-then-regional reads.
            enabled: fetchOverlay
                && enabled
                && Boolean(countryCode)
                && !location.isResolving
                && !(needsSubdivisionMatch && subdivisionsQuery.isLoading),
            staleTime: STALE_TIMES.HOLIDAYS,
            gcTime: 14 * DAY_MS,
            select: (holidays: HolidayRecord[]) => holidays.filter((holiday) => holiday.date >= start && holiday.date <= end),
        })),
        combine: (results) => ({
            holidays: results.flatMap((result) => result.data ?? []),
            isLoading: results.some((result) => result.isLoading),
        }),
    });

    const holidaysByDate = useMemo(() => {
        const map = new Map<string, HolidayRecord[]>();
        for (const holiday of holidayYears.holidays) {
            const existing = map.get(holiday.date) ?? [];
            existing.push(holiday);
            map.set(holiday.date, existing);
        }
        return map;
    }, [holidayYears.holidays]);

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
        holidays: holidayYears.holidays,
        holidaysByDate,
        holidayDateSet,
        holidaysLoading: holidayYears.isLoading,
        countryCode,
        subdivisionCode,
        subdivisionLabel,
        regionLabel,
        source,
        setEnabled,
    };
}
