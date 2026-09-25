import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, type LucideIcon } from "lucide-react";
import { useSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useUserLocation } from "./use-user-location";

export interface WeatherData {
    temp: number;
    condition: string;
    icon: LucideIcon;
}

/** off: turned off in settings · unavailable: no location to look up · error: the lookup failed */
export type WeatherStatus = "off" | "unavailable" | "loading" | "ready" | "error";

// WMO Weather interpretation codes (WW)
// https://open-meteo.com/en/docs
const weatherMapping: Record<number, { label: string; icon: LucideIcon }> = {
    0: { label: "Clear", icon: Sun },
    1: { label: "Mainly Clear", icon: Sun },
    2: { label: "Partly Cloudy", icon: Cloud },
    3: { label: "Overcast", icon: Cloud },
    45: { label: "Foggy", icon: Cloud },
    48: { label: "Foggy", icon: Cloud },
    51: { label: "Light Drizzle", icon: CloudDrizzle },
    53: { label: "Drizzle", icon: CloudDrizzle },
    55: { label: "Heavy Drizzle", icon: CloudDrizzle },
    56: { label: "Freezing Drizzle", icon: CloudSnow },
    57: { label: "Freezing Drizzle", icon: CloudSnow },
    61: { label: "Light Rain", icon: CloudRain },
    63: { label: "Rain", icon: CloudRain },
    65: { label: "Heavy Rain", icon: CloudRain },
    66: { label: "Freezing Rain", icon: CloudSnow },
    67: { label: "Freezing Rain", icon: CloudSnow },
    71: { label: "Light Snow", icon: CloudSnow },
    73: { label: "Snow", icon: CloudSnow },
    75: { label: "Heavy Snow", icon: CloudSnow },
    77: { label: "Snow Grains", icon: CloudSnow },
    80: { label: "Light Showers", icon: CloudRain },
    81: { label: "Showers", icon: CloudRain },
    82: { label: "Heavy Showers", icon: CloudRain },
    85: { label: "Snow Showers", icon: CloudSnow },
    86: { label: "Heavy Snow Showers", icon: CloudSnow },
    95: { label: "Thunderstorm", icon: CloudLightning },
    96: { label: "Thunderstorm", icon: CloudLightning },
    99: { label: "Thunderstorm", icon: CloudLightning },
};

const WEATHER_STALE_MS = 20 * 60 * 1000;
const WEATHER_GC_MS = 60 * 60 * 1000;

/**
 * Current weather (Celsius) for the location `useUserLocation` resolved. It never
 * asks the browser for a position: without coordinates it reports "unavailable".
 */
export function useWeather() {
    const { data: settings } = useSettings();
    const client = useApiClient();
    const location = useUserLocation();
    const enabled = (settings?.weather?.enabled ?? true) && location.mode !== "off";
    const coordinates = location.place?.coordinates ?? null;

    const query = useQuery({
        queryKey: queryKeys.weather.current(coordinates?.latitude ?? null, coordinates?.longitude ?? null),
        queryFn: async () => {
            const response = await client.api.proxy.weather.$get({
                query: { latitude: String(coordinates!.latitude), longitude: String(coordinates!.longitude) },
            });
            return unwrapResponse(response);
        },
        enabled: enabled && location.ready && coordinates !== null,
        staleTime: WEATHER_STALE_MS,
        gcTime: WEATHER_GC_MS,
        retry: 1,
        // The key carries coordinates; keep them out of the offline cache.
        meta: { persist: false },
    });

    const weather = useMemo<WeatherData | null>(() => {
        if (!query.data) return null;
        const mapped = weatherMapping[query.data.weatherCode] ?? { label: "Cloudy", icon: Cloud };
        return { temp: Math.round(query.data.temperature), condition: mapped.label, icon: mapped.icon };
    }, [query.data]);

    let status: WeatherStatus;
    if (!enabled) status = "off";
    else if (weather) status = "ready";
    else if (query.isError) status = "error";
    else if (location.isResolving || (coordinates !== null && query.isPending)) status = "loading";
    else status = "unavailable";

    return { weather, status };
}
