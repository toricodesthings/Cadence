import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
    Sun,
    Moon,
    Cloud,
    CloudSun,
    CloudMoon,
    CloudFog,
    CloudRain,
    CloudSnow,
    CloudLightning,
    CloudDrizzle,
    type LucideIcon,
} from "lucide-react";
import { useSettings } from "../core/use-settings";
import { useApiClient } from "../auth/use-api-client";
import { unwrapResponse } from "../../lib/api/helpers";
import { queryKeys } from "../../lib/api/query-keys";
import { useUserLocation } from "./use-user-location";
import type { DayPeriod } from "../../lib/constants/greetings";

export interface WeatherData {
    /** Rounded, in the unit of the place: Fahrenheit in the US and a few others, else Celsius. */
    temp: number;
    /** Raw temperature in Celsius, used for unit-independent sky warmth tinting. */
    celsius: number;
    /** WMO weather code (0–99). */
    code: number;
    /** Whether the sun is currently up at the resolved location. */
    isDay: boolean;
    condition: string;
    icon: LucideIcon;
}

/** off: turned off in settings · unavailable: no location to look up · error: the lookup failed */
export type WeatherStatus = "off" | "unavailable" | "loading" | "ready" | "error";

type Described = { label: string; icon: LucideIcon };

// WMO weather codes (https://open-meteo.com/en/docs), folded into a few plain words.
function describe(code: number, isDay: boolean): Described {
    if (code <= 1) return { label: "clear", icon: isDay ? Sun : Moon };
    if (code === 2) return { label: "partly cloudy", icon: isDay ? CloudSun : CloudMoon };
    if (code === 45 || code === 48) return { label: "fog", icon: CloudFog };
    if (code >= 95) return { label: "storm", icon: CloudLightning };
    return precipitationOf(code) ?? { label: "cloudy", icon: Cloud };
}

/** Drizzle, sleet, rain or snow; null for any other code. */
function precipitationOf(code: number): Described | null {
    if (code >= 51 && code <= 57) return { label: "drizzle", icon: CloudDrizzle };
    if (code === 66 || code === 67) return { label: "sleet", icon: CloudSnow };
    if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return { label: "rain", icon: CloudRain };
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: "snow", icon: CloudSnow };
    return null;
}

const clampPercent = (n: number) => Math.max(0, Math.min(100, n));

const PERIOD_FALLBACK_WARMTH: Record<DayPeriod, number> = {
    afternoon: 68,
    morning: 58,
    evening: 42,
    night: 15,
};

const DAYLIGHT_SCORE: Record<DayPeriod, number> = {
    afternoon: 100,
    morning: 80,
    evening: 70,
    night: 45,
};

function skyConditionScore(code: number, isDay: boolean): number {
    if (code <= 1) return isDay ? 100 : 30;
    if (code === 2) return isDay ? 72 : 22;
    if (code === 45 || code === 48) return 26;
    if (code >= 95) return 8;
    if (code >= 51 && code <= 57) return 18;
    if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return 12;
    if (code === 66 || code === 67 || (code >= 71 && code <= 77) || code === 85 || code === 86) return 5;
    return 38;
}

/**
 * Continuous 0–100 sky warmth position for Capture's adaptive color spectrum:
 * 100 leans fully into the active theme's primary accent (hot, sunny, daytime),
 * 0 shifts into a tranquil theme-derived calm tone (cold, rainy/snowy, night).
 * Blends temperature (45%), sky condition (35%), and daylight/time-of-day (20%),
 * falling back smoothly to the time of day when weather is unavailable.
 */
export function skyWarmth(period: DayPeriod, weather?: Pick<WeatherData, "celsius" | "code" | "isDay"> | null): number {
    if (!weather) return PERIOD_FALLBACK_WARMTH[period];
    const tempScore = clampPercent(((weather.celsius + 5) / 35) * 100);
    const skyScore = skyConditionScore(weather.code, weather.isDay);
    const lightScore = weather.isDay ? DAYLIGHT_SCORE[period] : 0;
    return Math.round(clampPercent(tempScore * 0.45 + skyScore * 0.35 + lightScore * 0.2));
}

/** Places that read temperatures in Fahrenheit. */
const FAHRENHEIT = new Set(["US", "BS", "KY", "LR", "PW", "FM", "MH"]);

const WEATHER_STALE_MS = 20 * 60 * 1000;
const WEATHER_GC_MS = 60 * 60 * 1000;

/**
 * Current weather for the location `useUserLocation` resolved. It never
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
        const { label, icon } = describe(query.data.weatherCode, query.data.isDay);
        const celsius = query.data.temperature;
        const temp = FAHRENHEIT.has(location.place?.countryCode ?? "") ? (celsius * 9) / 5 + 32 : celsius;
        return {
            temp: Math.round(temp),
            celsius,
            code: query.data.weatherCode,
            isDay: query.data.isDay,
            condition: label,
            icon,
        };
    }, [query.data, location.place?.countryCode]);

    let status: WeatherStatus;
    if (!enabled) status = "off";
    else if (weather) status = "ready";
    else if (query.isError) status = "error";
    else if (location.isResolving || (coordinates !== null && query.isPending)) status = "loading";
    else status = "unavailable";

    return { weather, status };
}
