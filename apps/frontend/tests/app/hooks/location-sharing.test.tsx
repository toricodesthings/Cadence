import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface GeolocationTestSetup {
    getCurrentPositionMock: ReturnType<typeof vi.fn>;
    fetchMock: ReturnType<typeof vi.fn>;
}

function installLocationEnvironment(): GeolocationTestSetup {
    const getCurrentPositionMock = vi.fn((success: PositionCallback) => {
        success({
            coords: {
                latitude: 43.6532,
                longitude: -79.3832,
                accuracy: 10,
                altitude: null,
                altitudeAccuracy: null,
                heading: null,
                speed: null,
                toJSON() {
                    return {};
                },
            },
            timestamp: Date.now(),
            toJSON() {
                return {};
            },
        } as GeolocationPosition);
    });

    Object.defineProperty(window.navigator, "geolocation", {
        configurable: true,
        value: {
            getCurrentPosition: getCurrentPositionMock,
        },
    });

    Object.defineProperty(window.navigator, "permissions", {
        configurable: true,
        value: {
            query: vi.fn().mockResolvedValue({ state: "prompt" }),
        },
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes("nominatim.openstreetmap.org")) {
            return new Response(
                JSON.stringify({
                    address: {
                        country_code: "ca",
                        state: "Ontario",
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }

        if (url.includes("api.open-meteo.com")) {
            return new Response(
                JSON.stringify({
                    current_weather: {
                        temperature: 19.4,
                        weathercode: 0,
                    },
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
            );
        }

        throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    return { getCurrentPositionMock, fetchMock };
}

describe("shared geolocation state", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllGlobals();
    });

    it("deduplicates precise-location resolution across hooks", async () => {
        const { getCurrentPositionMock, fetchMock } = installLocationEnvironment();
        const { useGeolocation } = await import("../../../app/hooks/environment/use-geolocation");

        const first = renderHook(() => useGeolocation());
        const second = renderHook(() => useGeolocation());

        let firstResult;
        let secondResult;
        await act(async () => {
            [firstResult, secondResult] = await Promise.all([
                first.result.current.resolvePreciseLocation(),
                second.result.current.resolvePreciseLocation(),
            ]);
        });

        expect(firstResult).toEqual({
            status: "granted",
            location: {
                countryCode: "CA",
                subdivisionName: "Ontario",
            },
        });
        expect(secondResult).toEqual(firstResult);
        expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await waitFor(() => {
            expect(second.result.current.preciseLocation).toEqual({
                countryCode: "CA",
                subdivisionName: "Ontario",
            });
        });
    });

    it("reuses the resolved shared coordinates when weather loads", async () => {
        const { getCurrentPositionMock, fetchMock } = installLocationEnvironment();
        const { useGeolocation } = await import("../../../app/hooks/environment/use-geolocation");
        const { useWeather } = await import("../../../app/hooks/environment/use-weather");

        const location = renderHook(() => useGeolocation());

        await act(async () => {
            await location.result.current.resolvePreciseLocation();
        });

        const weather = renderHook(() => useWeather());

        await waitFor(() => {
            expect(weather.result.current.loading).toBe(false);
            expect(weather.result.current.weather).toMatchObject({
                temp: 19,
                condition: "Clear",
            });
        });

        expect(getCurrentPositionMock).toHaveBeenCalledTimes(1);
        expect(
            fetchMock.mock.calls.filter(([input]) =>
                String(input).includes("nominatim.openstreetmap.org"),
            ),
        ).toHaveLength(1);
        expect(
            fetchMock.mock.calls.filter(([input]) =>
                String(input).includes("api.open-meteo.com"),
            ).length,
        ).toBeGreaterThanOrEqual(1);
    });
});
