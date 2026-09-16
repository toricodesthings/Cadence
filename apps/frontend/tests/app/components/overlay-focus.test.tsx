import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResponsiveOverlayPanel } from "../../../app/components/shared/ResponsiveOverlayPanel";

vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { appearance: { motion: "reduced" } } }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: true, isTablet: false }) }));

describe("Overlay focus", () => {
    it("accepts Escape while lazy sheet content is still loading", async () => {
        const onClose = vi.fn();
        render(<ResponsiveOverlayPanel open onClose={onClose} ariaLabel="Assistant">{null}</ResponsiveOverlayPanel>);
        const panel = screen.getByRole("dialog", { name: "Assistant" });
        await waitFor(() => expect(document.activeElement).toBe(panel));
        fireEvent.keyDown(panel, { key: "Escape" });
        expect(onClose).toHaveBeenCalledOnce();
    });
});
