import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { useSortMode } from "../../../app/hooks/ui/use-sort-mode";
import { useFocusViewUrl } from "../../../app/hooks/ui/use-focus-view-url";
import { DEFAULT_DEFINITION } from "@cadence/nlp/focus-views";
import { useFocusViewStore } from "../../../app/stores/focus-view-store";

const at = (url: string) => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
const run = <T,>(url: string, hook: () => T) => renderHook(() => ({ value: hook(), location: useLocation() }), { wrapper: at(url) });
afterEach(() => { localStorage.clear(); useFocusViewStore.setState({ captureOrder: "newest", activePresetId: null, activeSavedViewId: null, activeDefinition: null, customDefinition: null }); });

describe("useUrlState through useSortMode", () => {
    it("URL beats the device choice, which beats the default", () => {
        expect(run("/today", () => useSortMode("today").sortMode).result.current.value).toBe("smart");
        localStorage.setItem("cadence:sort:today", "manual");
        expect(run("/today", () => useSortMode("today").sortMode).result.current.value).toBe("manual");
        expect(run("/today?sort=priority", () => useSortMode("today").sortMode).result.current.value).toBe("priority");
    });

    it("a shared link doesn't overwrite the device choice", () => {
        localStorage.setItem("cadence:sort:today", "manual");
        run("/today?sort=priority", () => useSortMode("today"));
        expect(localStorage.getItem("cadence:sort:today")).toBe("manual");
    });

    it("choosing replaces the address (no Back step), saves the device value, and drops the default", () => {
        const { result } = run("/today", () => useSortMode("today"));
        act(() => result.current.value.setSortMode("priority"));
        expect(result.current.location.search).toBe("?sort=priority");
        expect(localStorage.getItem("cadence:sort:today")).toBe("priority");
        act(() => result.current.value.setSortMode("smart"));
        expect(result.current.location.search).toBe("");
    });

    it("an invalid value is ignored and dropped from the address", () => {
        const { result } = run("/today?sort=nonsense&tag=x", () => useSortMode("today").sortMode);
        expect(result.current.value).toBe("smart");
        expect(result.current.location.search).toBe("?tag=x");
    });
});

describe("useFocusViewUrl", () => {
    it("a focus preset and capture order in the address are applied", () => {
        run("/?focus=quick-wins&order=oldest", () => useFocusViewUrl(true));
        const state = useFocusViewStore.getState();
        expect(state.captureOrder).toBe("oldest");
        expect(state.activePresetId).toBe("quick-wins");
    });

    it("the store writes itself to the address when it changes, and leaves order alone off Capture", () => {
        const { result } = run("/today", () => useFocusViewUrl(false));
        act(() => useFocusViewStore.setState({ captureOrder: "oldest", activeSavedViewId: "view-1" }));
        expect(result.current.location.search).toBe("?saved=view-1");
    });

    it("a custom view in the address is applied, and one made in the app is written as params", () => {
        run("/?state=waiting&pmin=2", () => useFocusViewUrl(false));
        expect(useFocusViewStore.getState().customDefinition).toMatchObject({ states: ["WAITING"], priorityMin: 2 });

        const { result } = run("/today", () => useFocusViewUrl(false));
        act(() => useFocusViewStore.getState().setCustomDefinition({ ...DEFAULT_DEFINITION, missingStructureOnly: true }));
        expect(result.current.location.search).toBe("?bare=1");
        act(() => useFocusViewStore.getState().clearActiveDefinition());
        expect(result.current.location.search).toBe("");
    });
});
