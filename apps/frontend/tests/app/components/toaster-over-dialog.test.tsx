import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../../app/components/primitives/Dialog";
import { Toaster } from "../../../app/components/feedback/Toaster";
import { ResponsiveOverlayPanel } from "../../../app/components/shared/ResponsiveOverlayPanel";

vi.mock("../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: { appearance: { motion: "reduced" } } }) }));
vi.mock("../../../app/hooks/ui/use-shell-mode", () => ({ useShellMode: () => ({ isCompact: false, isTablet: false, isPhone: false, isTouch: false }) }));

function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true);
    return (
        <>
            <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) onClose(); }}>
                <DialogContent>
                    <DialogTitle>Edit</DialogTitle>
                    <DialogDescription>Body</DialogDescription>
                    <button>Inside</button>
                </DialogContent>
            </Dialog>
            <Toaster />
        </>
    );
}

describe("Toaster over an open dialog", () => {
    it("keeps Undo reachable: pointer events on, taps don't dismiss, focus stays", async () => {
        const onClose = vi.fn();
        const undo = vi.fn();
        render(<Harness onClose={onClose} />);
        await screen.findByRole("dialog");
        act(() => { toast("Task deleted", { action: { label: "Undo", onClick: undo } }); });
        const button = await screen.findByRole("button", { name: "Undo" });
        const host = document.querySelector<HTMLElement>("[data-cadence-toaster]")!;

        // Radix sets body to pointer-events: none; the toaster has to opt back in.
        expect(document.body.style.pointerEvents).toBe("none");
        expect(host.style.pointerEvents).toBe("auto");

        // Not hidden from assistive tech.
        expect(host.closest("[aria-hidden='true']")).toBeNull();

        // A tap on the toast is not "outside" the dialog.
        fireEvent.pointerDown(button);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeTruthy();

        // Keyboard focus moved into the toaster is not pulled back into the dialog.
        act(() => button.focus());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(document.activeElement).toBe(button);

        fireEvent.click(button);
        await waitFor(() => expect(undo).toHaveBeenCalledOnce());
    });

    it("does the same over a sheet", async () => {
        const onClose = vi.fn();
        render(<><ResponsiveOverlayPanel open onClose={onClose} ariaLabel="Sheet"><button>Inside</button></ResponsiveOverlayPanel><Toaster /></>);
        await screen.findByRole("dialog", { name: "Sheet" });
        act(() => { toast("Moved", { action: { label: "Undo", onClick: () => {} } }); });
        const button = await screen.findByRole("button", { name: "Undo" });
        const host = document.querySelector<HTMLElement>("[data-cadence-toaster]")!;
        expect(host.closest("[aria-hidden='true']")).toBeNull();
        fireEvent.pointerDown(button);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(onClose).not.toHaveBeenCalled();
        act(() => button.focus());
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(document.activeElement).toBe(button);
    });
});
