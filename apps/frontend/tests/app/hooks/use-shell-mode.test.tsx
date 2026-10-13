import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getShellMode, useShellMode } from "../../../app/hooks/ui/use-shell-mode";
import { stubTouch } from "../../helpers";

describe("getShellMode", () => {
    it.each([
        [1920, false, "wide"], [1440, true, "wide"],
        [1119, true, "tablet"], [768, true, "tablet"], [767, true, "phone"],
        // A mouse keeps the desktop shell on a tall, narrow monitor (1080x1920, 900x1440, 768x1366).
        [1080, false, "laptop"], [900, false, "laptop"], [768, false, "laptop"], [767, false, "phone"],
        [1120, true, "laptop"],
    ] as const)("%ipx, touch=%s → %s", (width, touch, mode) => {
        expect(getShellMode(width, touch)).toBe(mode);
    });
});

describe("useShellMode", () => {
    afterEach(() => { Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 }); });

    it("reads width and pointer together", () => {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 1080 });
        stubTouch(false);
        const mouse = renderHook(() => useShellMode()).result.current;
        expect(mouse).toMatchObject({ mode: "laptop", isDesktop: true, isCompact: false, isTouch: false });
        stubTouch(true);
        const touch = renderHook(() => useShellMode()).result.current;
        expect(touch).toMatchObject({ mode: "tablet", isDesktop: false, isCompact: true, isTouch: true });
    });
});
