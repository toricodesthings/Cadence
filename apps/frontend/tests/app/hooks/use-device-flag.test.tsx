import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceFlag } from "../../../app/hooks/ui/use-device-flag";

describe("useDeviceFlag", () => {
    beforeEach(() => window.localStorage.clear());

    it("starts off, writes through, and is read back on the next mount", () => {
        const { result, unmount } = renderHook(() => useDeviceFlag("cadence-test-flag"));
        expect(result.current[0]).toBe(false);
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        unmount();
        expect(renderHook(() => useDeviceFlag("cadence-test-flag")).result.current[0]).toBe(true);
    });

    it("still works when storage is blocked", () => {
        const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
        const { result } = renderHook(() => useDeviceFlag("cadence-test-flag"));
        act(() => result.current[1](true));
        expect(result.current[0]).toBe(true);
        spy.mockRestore();
    });
});
