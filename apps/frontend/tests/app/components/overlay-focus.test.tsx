import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    it("a nested sheet is reachable and focused; Escape closes only the inner one, once", async () => {
        const outerClose = vi.fn();
        const innerClose = vi.fn();
        function Nested({ inner }: { inner: boolean }) {
            return (
                <ResponsiveOverlayPanel open onClose={outerClose} ariaLabel="Capture">
                    <button>Outer action</button>
                    <ResponsiveOverlayPanel open={inner} onClose={innerClose} ariaLabel="Schedule task">
                        <button data-initial-focus>Inner action</button>
                    </ResponsiveOverlayPanel>
                </ResponsiveOverlayPanel>
            );
        }
        const { rerender } = render(<Nested inner={false} />);
        await screen.findByRole("dialog", { name: "Capture" });
        rerender(<Nested inner />);
        const inner = await screen.findByRole("dialog", { name: "Schedule task" });
        expect(inner.closest("[aria-hidden='true']")).toBeNull();
        await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inner action" })));

        fireEvent.keyDown(document.activeElement!, { key: "Escape" });
        expect(innerClose).toHaveBeenCalledOnce();
        expect(outerClose).not.toHaveBeenCalled();

        // Closing the inner sheet hands the page back to the outer one.
        rerender(<Nested inner={false} />);
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Schedule task" })).toBeNull());
        act(() => screen.getByRole("button", { name: "Outer action" }).focus());
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Outer action" }));
    });

    it("lets a control that owns Escape keep it", async () => {
        const onClose = vi.fn();
        render(
            <ResponsiveOverlayPanel open onClose={onClose} ariaLabel="Assistant">
                <input data-escape-owner aria-label="Rename" />
            </ResponsiveOverlayPanel>,
        );
        const input = await screen.findByLabelText("Rename");
        fireEvent.keyDown(input, { key: "Escape" });
        expect(onClose).not.toHaveBeenCalled();
    });
});
