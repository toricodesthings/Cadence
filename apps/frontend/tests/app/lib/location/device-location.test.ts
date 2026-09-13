import { beforeEach, describe, expect, it, vi } from "vitest";

type DeviceLocationModule = typeof import("../../../../app/lib/location/device-location");

const CACHE_PREFIX = "cadence:device-location:";

function fakePosition(latitude: number, longitude: number) {
    return {
        coords: { latitude, longitude, accuracy: 10, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
        timestamp: Date.now(),
    } as unknown as GeolocationPosition;
}

function installGeolocation({
    permission = "prompt",
    outcome = "granted",
}: {
    permission?: PermissionState;
    outcome?: "granted" | "denied" | "timeout";
} = {}) {
    const getCurrentPosition = vi.fn((
        success: PositionCallback,
        failure?: PositionErrorCallback | null,
        _options?: PositionOptions,
    ) => {
        if (outcome === "denied") failure?.({ code: 1, message: "denied" } as GeolocationPositionError);
        else if (outcome === "timeout") failure?.({ code: 3, message: "timeout" } as GeolocationPositionError);
        else success(fakePosition(43.653226, -79.383184));
    });
    Object.defineProperty(window.navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });

    const status: { state: PermissionState; onchange: (() => void) | null } = { state: permission, onchange: null };
    Object.defineProperty(window.navigator, "permissions", {
        configurable: true,
        value: { query: vi.fn().mockResolvedValue(status) },
    });

    return { getCurrentPosition, status };
}

async function loadStore(): Promise<DeviceLocationModule> {
    vi.resetModules();
    return import("../../../../app/lib/location/device-location");
}

function cachedKeys() {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(CACHE_PREFIX)) keys.push(key);
    }
    return keys;
}

const lookup = vi.fn(async () => ({ countryCode: "CA", subdivisionCode: "CA-ON", subdivisionName: "Ontario" }));

describe("device location store", () => {
    beforeEach(() => {
        lookup.mockClear();
        sessionStorage.clear();
    });

    it("rounds coordinates, skips high accuracy, and shares one request", async () => {
        const { getCurrentPosition } = installGeolocation();
        const store = await loadStore();
        store.bindDeviceLocationUser("user-a");

        const [first, second] = await Promise.all([
            store.requestDeviceLocation(lookup),
            store.requestDeviceLocation(lookup),
        ]);

        expect(second).toEqual(first);
        expect(first.place?.coordinates).toEqual({ latitude: 43.65, longitude: -79.38 });
        expect(getCurrentPosition).toHaveBeenCalledTimes(1);
        expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false });
        expect(lookup).toHaveBeenCalledWith({ latitude: 43.65, longitude: -79.38 });
    });

    it("caches per user and never hands one user's position to another", async () => {
        installGeolocation();
        const store = await loadStore();

        store.bindDeviceLocationUser("user-a");
        await store.requestDeviceLocation(lookup);
        expect(localStorage.getItem(`${CACHE_PREFIX}user-a`)).not.toBeNull();

        store.bindDeviceLocationUser("user-b");
        expect(store.getDeviceLocationSnapshot().place).toBeNull();

        store.bindDeviceLocationUser("user-a");
        expect(store.getDeviceLocationSnapshot().place?.subdivisionCode).toBe("CA-ON");
    });

    it("removes every cached position and the legacy keys on sign-out", async () => {
        installGeolocation();
        const store = await loadStore();
        store.bindDeviceLocationUser("user-a");
        await store.requestDeviceLocation(lookup);
        localStorage.setItem(`${CACHE_PREFIX}user-b`, "{}");
        localStorage.setItem("cadence:geolocation-cache", "{}");
        sessionStorage.setItem("cadence:schedule-holiday-prompt-dismissed", "1");

        store.clearAllDeviceLocationData();

        expect(cachedKeys()).toEqual([]);
        expect(localStorage.getItem("cadence:geolocation-cache")).toBeNull();
        expect(sessionStorage.getItem("cadence:schedule-holiday-prompt-dismissed")).toBeNull();
        expect(store.getDeviceLocationSnapshot().place).toBeNull();
    });

    it("records a denial without looking anything up", async () => {
        installGeolocation({ outcome: "denied" });
        const store = await loadStore();
        store.bindDeviceLocationUser("user-a");

        const result = await store.requestDeviceLocation(lookup);

        expect(result.status).toBe("denied");
        expect(store.getDeviceLocationSnapshot().permissionState).toBe("denied");
        expect(lookup).not.toHaveBeenCalled();
    });

    it("marks a timeout as failed so it isn't retried in a loop", async () => {
        installGeolocation({ outcome: "timeout" });
        const store = await loadStore();
        store.bindDeviceLocationUser("user-a");

        const result = await store.requestDeviceLocation(lookup);

        expect(result.status).toBe("error");
        expect(store.getDeviceLocationSnapshot().failed).toBe(true);
    });

    it("keeps the coordinates when naming the region fails", async () => {
        installGeolocation();
        const store = await loadStore();
        store.bindDeviceLocationUser("user-a");

        const result = await store.requestDeviceLocation(async () => {
            throw new Error("lookup down");
        });

        expect(result.place).toEqual({
            countryCode: null,
            subdivisionCode: null,
            subdivisionName: null,
            coordinates: { latitude: 43.65, longitude: -79.38 },
        });
    });

    it("follows the browser permission and forgets the position once it's revoked", async () => {
        const { status } = installGeolocation({ permission: "granted" });
        const store = await loadStore();
        store.bindDeviceLocationUser("user-a");
        store.watchDevicePermission();

        await vi.waitFor(() => expect(store.getDeviceLocationSnapshot().permissionState).toBe("granted"));
        await store.requestDeviceLocation(lookup);
        expect(store.getDeviceLocationSnapshot().place).not.toBeNull();

        status.state = "denied";
        status.onchange?.();

        expect(store.getDeviceLocationSnapshot().permissionState).toBe("denied");
        expect(store.getDeviceLocationSnapshot().place).toBeNull();
        expect(localStorage.getItem(`${CACHE_PREFIX}user-a`)).toBeNull();
    });
});
