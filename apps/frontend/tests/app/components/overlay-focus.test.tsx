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
    it("a sheet opened inside another stays live, however the outer sweep caught its root", async () => {
        function Nested({ inner }: { inner: boolean }) {
            return (
                <ResponsiveOverlayPanel open onClose={() => {}} ariaLabel="Capture">
                    <ResponsiveOverlayPanel open={inner} onClose={() => {}} ariaLabel="Schedule task">{null}</ResponsiveOverlayPanel>
                </ResponsiveOverlayPanel>
            );
        }
        const { rerender } = render(<Nested inner={false} />);
        await screen.findByRole("dialog", { name: "Capture" });
        rerender(<Nested inner />);
        const inner = await screen.findByRole("dialog", { name: "Schedule task" });
        const root = inner.closest<HTMLElement>("[data-cadence-overlay-root]")!;
        expect(root.inert).toBe(false);
        expect(root.getAttribute("aria-hidden")).toBeNull();
        // Closing it hands the page back to the outer sheet.
        rerender(<Nested inner={false} />);
        const outer = screen.getByRole("dialog", { name: "Capture" }).closest<HTMLElement>("[data-cadence-overlay-root]")!;
        expect(outer.inert).toBe(false);
    });
});
