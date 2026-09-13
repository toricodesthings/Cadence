import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_DEFAULTS } from "../../../app/types/settings";

const mocks = vi.hoisted(() => {
    const approximateGet = vi.fn();
    const weatherGet = vi.fn();
    const reverseGet = vi.fn();
    return {
        settings: { data: {} as Record<string, unknown>, isFetched: false },
        mutateAsync: vi.fn(async () => ({})),
        approximateGet,
        weatherGet,
        reverseGet,
        client: {
            api: {
                proxy: {
                    geo: { approximate: { $get: approximateGet } },
                    weather: { $get: weatherGet },
                    geocode: { reverse: { $get: reverseGet } },
                },
            },
        },
    };
});

vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => mocks.settings,
    useUpdateSettings: () => ({ mutate: vi.fn(), mutateAsync: mocks.mutateAsync, flushPending: vi.fn() }),
}));

vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ session: { user: { id: "user-a" } } }),
}));

vi.mock("../../../app/hooks/auth/use-api-client", () => ({
    useApiClient: () => mocks.client,
}));

function jsonResponse(data: unknown) {
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function settingsWith(location: Partial<typeof SETTINGS_DEFAULTS.location>, weatherEnabled = true) {
    return {
        location: { ...SETTINGS_DEFAULTS.location, ...location },
        weather: { enabled: weatherEnabled },
    };
}

function installGeolocation(permission: PermissionState) {
    const getCurrentPosition = vi.fn();
    Object.defineProperty(window.navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    Object.defineProperty(window.navigator, "permissions", {
        configurable: true,
        value: { query: vi.fn().mockResolvedValue({ state: permission, onchange: null }) },
    });
    return getCurrentPosition;
}

async function renderLocationAndWeather() {
    vi.resetModules();
    const { useUserLocation } = await import("../../../app/hooks/environment/use-user-location");
    const { useWeather } = await import("../../../app/hooks/environment/use-weather");
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return renderHook(() => ({ location: useUserLocation(), weather: useWeather() }), { wrapper });
}

describe("useUserLocation", () => {
    beforeEach(() => {
        mocks.mutateAsync.mockClear();
        mocks.approximateGet.mockReset();
        mocks.weatherGet.mockReset();
        mocks.reverseGet.mockReset();
        mocks.approximateGet.mockImplementation(async () => jsonResponse({
            countryCode: "CA",
            subdivisionCode: "CA-ON",
            subdivisionName: "Ontario",
            city: "Toronto",
            coordinates: { latitude: 43.65, longitude: -79.38 },
        }));
        mocks.weatherGet.mockImplementation(async () => jsonResponse({ temperature: 19.4, weatherCode: 0 }));
    });

    it("does nothing until the server copy of settings has loaded", async () => {
        const getCurrentPosition = installGeolocation("prompt");
        mocks.settings = { data: {}, isFetched: false };

        const { result } = await renderLocationAndWeather();
        await act(async () => {});

        expect(result.current.location.ready).toBe(false);
        expect(result.current.location.shouldShowPrompt).toBe(false);
        expect(mocks.approximateGet).not.toHaveBeenCalled();
        expect(mocks.weatherGet).not.toHaveBeenCalled();
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("loads weather from the approximate location without ever asking the device", async () => {
        const getCurrentPosition = installGeolocation("prompt");
        mocks.settings = { data: settingsWith({ mode: "approximate" }), isFetched: true };

        const { result } = await renderLocationAndWeather();

        await waitFor(() => expect(result.current.weather.status).toBe("ready"));
        expect(result.current.weather.weather).toMatchObject({ temp: 19, condition: "Clear" });
        expect(result.current.location.place).toMatchObject({ source: "approximate", countryCode: "CA", city: "Toronto" });
        expect(result.current.location.shouldShowPrompt).toBe(true);
        expect(getCurrentPosition).not.toHaveBeenCalled();
        expect(mocks.weatherGet).toHaveBeenCalledWith({ query: { latitude: "43.65", longitude: "-79.38" } });
    });

    it("never shows the notice again once a choice was saved", async () => {
        installGeolocation("prompt");
        mocks.settings = {
            data: settingsWith({ mode: "approximate", promptDismissedAt: "2026-09-13T10:00:00.000Z" }),
            isFetched: true,
        };

        const { result } = await renderLocationAndWeather();

        await waitFor(() => expect(result.current.location.ready).toBe(true));
        expect(result.current.location.shouldShowPrompt).toBe(false);
    });

    it("makes no location or weather requests when location is off", async () => {
        const getCurrentPosition = installGeolocation("granted");
        mocks.settings = { data: settingsWith({ mode: "off" }), isFetched: true };

        const { result } = await renderLocationAndWeather();
        await act(async () => {});

        expect(result.current.location.place).toBeNull();
        expect(result.current.weather.status).toBe("off");
        expect(result.current.location.shouldShowPrompt).toBe(false);
        expect(mocks.approximateGet).not.toHaveBeenCalled();
        expect(mocks.weatherGet).not.toHaveBeenCalled();
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("falls back to approximate instead of re-asking when precise is blocked", async () => {
        const getCurrentPosition = installGeolocation("denied");
        mocks.settings = { data: settingsWith({ mode: "precise" }), isFetched: true };

        const { result } = await renderLocationAndWeather();

        await waitFor(() => expect(result.current.location.place?.source).toBe("approximate"));
        expect(result.current.location.preciseFallback).toBe(true);
        expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it("records the dismissal with every explicit choice", async () => {
        installGeolocation("prompt");
        mocks.settings = { data: settingsWith({ mode: "approximate" }), isFetched: true };

        const { result } = await renderLocationAndWeather();
        await waitFor(() => expect(result.current.location.ready).toBe(true));

        await act(async () => {
            await result.current.location.setMode("off");
        });

        expect(mocks.mutateAsync).toHaveBeenCalledWith({
            location: { mode: "off", promptDismissedAt: expect.any(String) },
        });
    });

    it("uses the saved city for weather in manual mode", async () => {
        installGeolocation("prompt");
        mocks.settings = {
            data: settingsWith({
                mode: "manual",
                countryCode: "DE",
                city: { name: "Berlin", latitude: 52.52, longitude: 13.41 },
            }),
            isFetched: true,
        };

        const { result } = await renderLocationAndWeather();

        await waitFor(() => expect(result.current.weather.status).toBe("ready"));
        expect(result.current.location.place).toMatchObject({ source: "manual", countryCode: "DE", city: "Berlin" });
        expect(mocks.approximateGet).not.toHaveBeenCalled();
        expect(mocks.weatherGet).toHaveBeenCalledWith({ query: { latitude: "52.52", longitude: "13.41" } });
    });
});
