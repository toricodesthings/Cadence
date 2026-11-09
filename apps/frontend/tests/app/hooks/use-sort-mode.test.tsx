import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { useSortMode } from "../../../app/hooks/ui/use-sort-mode";

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const sort = (page: string) => renderHook(() => useSortMode(page), { wrapper });

describe("useSortMode", () => {
    beforeEach(() => window.localStorage.clear());

    it("keeps each page's sort in this device's storage, never the account", () => {
        const today = sort("today");
        expect(today.result.current.sortMode).toBe("smart");
        act(() => today.result.current.setSortMode("priority"));
        today.unmount();

        expect(window.localStorage.getItem("cadence:sort:today")).toBe("priority");
        expect(sort("today").result.current.sortMode).toBe("priority");
        expect(sort("upcoming").result.current.sortMode).toBe("smart");
    });

    it("falls back to smart for a value it doesn't know", () => {
        window.localStorage.setItem("cadence:sort:project:a", "sideways");
        expect(sort("project:a").result.current.sortMode).toBe("smart");
    });
});
