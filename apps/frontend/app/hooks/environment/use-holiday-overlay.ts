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

type Place = ReturnType<typeof useUserLocation>["place"];

/**
 * The holiday country and where it came from. The resolved location wins. Without one, the device
 * time zone says more about where someone is than their language setting does.
 */
function holidayCountry(place: Place, timeZoneCountryCode: string | null, localeCountryCode: string | null) {
    if (place?.countryCode) return { countryCode: place.countryCode, source: place.source as HolidayRegionSource };
    if (timeZoneCountryCode) return { countryCode: timeZoneCountryCode, source: "timezone" as const };
    return { countryCode: localeCountryCode, source: localeCountryCode ? "locale" as const : null };
}

/** A region the person chose is used as is; a located one is matched to the provider's subdivisions. */
function subdivisionNeed(place: Place) {
    return {
        manualSubdivisionCode: place?.source === "manual" ? place.subdivisionCode : null,
        needsSubdivisionMatch: Boolean(
            place
            && place.source !== "manual"
            && place.countryCode
            && (place.subdivisionCode || place.subdivisionName),
        ),
    };
}

function subdivisionLabelOf(code: string | null, subdivisions: { code: string; label: string }[] | undefined, place: Place) {
    if (!code) return null;
    return subdivisions?.find((subdivision) => subdivision.code === code)?.label ?? place?.subdivisionName ?? code;
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
    const { countryCode, source } = holidayCountry(place, timeZoneCountryCode, localeCountryCode);
    const { manualSubdivisionCode, needsSubdivisionMatch } = subdivisionNeed(place);

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
    const subdivisionLabel = subdivisionLabelOf(subdivisionCode, subdivisionsQuery.data, place);
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
