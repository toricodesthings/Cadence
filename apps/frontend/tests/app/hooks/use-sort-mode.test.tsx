import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSortMode } from "../../../app/hooks/ui/use-sort-mode";

describe("useSortMode", () => {
    beforeEach(() => window.localStorage.clear());

    it("keeps each page's sort in this device's storage, never the account", () => {
        const today = renderHook(() => useSortMode("today"));
        expect(today.result.current.sortMode).toBe("smart");
        act(() => today.result.current.setSortMode("priority"));
        today.unmount();

        expect(window.localStorage.getItem("cadence:sort:today")).toBe("priority");
        expect(renderHook(() => useSortMode("today")).result.current.sortMode).toBe("priority");
        expect(renderHook(() => useSortMode("upcoming")).result.current.sortMode).toBe("smart");
    });

    it("falls back to smart for a value it doesn't know", () => {
        window.localStorage.setItem("cadence:sort:project:a", "sideways");
        expect(renderHook(() => useSortMode("project:a")).result.current.sortMode).toBe("smart");
    });
});
