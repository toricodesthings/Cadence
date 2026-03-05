import { useState, useEffect } from "react";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, CloudDrizzle, type LucideIcon } from "lucide-react";

export interface WeatherData {
    temp: number;
    condition: string;
    icon: LucideIcon;
}

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

interface OpenMeteoResponse {
    current_weather: {
        temperature: number;
        weathercode: number;
    };
}

/**
 * Fetches real-time weather using the browser's geolocation and Open-Meteo.
 * Returns temperature in Celsius.
 * If geolocation is denied, weather will remain null (no fallback).
 */
export function useWeather() {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const fetchWeather = async (lat: number, lon: number) => {
            try {
                const res = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=celsius`
                );
                const data = (await res.json()) as OpenMeteoResponse;

                if (!cancelled && data.current_weather) {
                    const code = data.current_weather.weathercode;
                    const mapped = weatherMapping[code] ?? { label: "Cloudy", icon: Cloud };

                    setWeather({
                        temp: Math.round(data.current_weather.temperature),
                        condition: mapped.label,
                        icon: mapped.icon,
                    });
                }
            } catch (err) {
                console.error("Weather fetch failed:", err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        if ("geolocation" in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
                () => {
                    // User denied location — just hide weather gracefully
                    if (!cancelled) setLoading(false);
                },
                { timeout: 8000, maximumAge: 300_000 } // cache position for 5 min
            );
        } else {
            setLoading(false);
        }

        return () => { cancelled = true; };
    }, []);

    return { weather, loading };
}
