import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateDialog } from "../../../app/components/desktop/UpdateDialog";
import type { AvailableAppUpdate } from "../../../app/platform/runtime";

function sampleUpdate(overrides: Partial<AvailableAppUpdate> = {}): AvailableAppUpdate {
    return {
        currentVersion: "2.0.2",
        version: "2.1.1",
        body: "Updated backend infrastructure.",
        install: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

describe("UpdateDialog", () => {
    it("renders the settings variant with Later and Install actions", async () => {
        const onClose = vi.fn();
        const update = sampleUpdate();

        render(<UpdateDialog update={update} onClose={onClose} />);

        expect(await screen.findByRole("alertdialog")).toBeTruthy();
        expect(screen.getByText("Update ready to install")).toBeTruthy();
        expect(screen.getByText("2.0.2")).toBeTruthy();
        expect(screen.getByText("2.1.1")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Later" }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("renders the required variant in Sign-In CardPage style with no Later button and blocks Escape", async () => {
        const update = sampleUpdate();

        render(<UpdateDialog variant="required" update={update} minVersion="2.1.0" />);

        const dialog = await screen.findByRole("alertdialog");
        expect(screen.getByText("Update required")).toBeTruthy();
        expect(screen.getByAltText("Cadence")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Later" })).toBeNull();

        fireEvent.keyDown(dialog, { key: "Escape" });
        expect(screen.getByRole("alertdialog")).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Install update" }));
        await waitFor(() => expect(update.install).toHaveBeenCalledOnce());
    });

    it("shows a checking state and retry/download fallback in required mode when no update object is loaded yet", async () => {
        const onRetry = vi.fn();
        const { rerender } = render(
            <UpdateDialog variant="required" update={null} minVersion="2.1.0" checking onRetry={onRetry} />,
        );

        expect(await screen.findByText("Checking for the latest update…")).toBeTruthy();

        rerender(
            <UpdateDialog variant="required" update={null} minVersion="2.1.0" checking={false} onRetry={onRetry} />,
        );

        expect(screen.getByText(/Cadence 2\.1\.0 or newer is required/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Check again" }));
        expect(onRetry).toHaveBeenCalledOnce();
        expect(screen.getByRole("link", { name: "Download the latest installer" })).toBeTruthy();
    });
});
