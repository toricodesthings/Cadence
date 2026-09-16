import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundSettings } from "../../../app/components/settings/appearance/BackgroundSettings";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), crop: vi.fn(), release: vi.fn() }));
vi.mock("../../../app/hooks/ui/use-background-image", () => ({
    useUploadBackgroundImage: () => ({ isPending: false, mutateAsync: mocks.upload }),
    useDeleteBackgroundImage: () => ({ isPending: false }),
    useBackgroundImageUrl: () => null,
}));
vi.mock("../../../app/lib/utils/image", () => ({
    loadCropSource: async () => ({ width: 1600, height: 900, url: "blob:preview", canvas: {} }),
    releaseCropSource: mocks.release,
    cropImage: mocks.crop,
}));

function setup() {
    return render(<MemoryRouter><BackgroundSettings
        backgroundMode="theme" backgroundColor={null} backgroundGradient={null} backgroundImage={null}
        onModeChange={vi.fn()} onColorChange={vi.fn()} onGradientChange={vi.fn()} onImageAdjust={vi.fn()}
    /></MemoryRouter>);
}
function pick() {
    fireEvent.change(screen.getByLabelText("Choose background photo"), {
        target: { files: [new File(["photo"], "photo.png", { type: "image/png" })] },
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({});
    mocks.crop.mockResolvedValue(new File(["crop"], "background.webp", { type: "image/webp" }));
    vi.stubGlobal("ResizeObserver", class {
        observe() { this.callback([{ contentRect: { width: 480 } }]); }
        disconnect() {}
        constructor(private callback: (entries: unknown[]) => void) {}
    });
});

describe("Background photo confirmation", () => {
    it("shows an add tile in theme mode and never uploads on selection or cancellation", async () => {
        setup();
        expect(screen.getByRole("button", { name: /Add a background/ })).toBeTruthy();
        pick();
        await screen.findByAltText("Preview of your background crop");
        expect(mocks.upload).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(mocks.upload).not.toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalledOnce();
    });

    it("uploads the confirmed zoomed crop once", async () => {
        setup(); pick();
        await screen.findByAltText("Preview of your background crop");
        fireEvent.change(screen.getByLabelText("Zoom"), { target: { value: "200" } });
        await waitFor(() => expect((screen.getByRole("button", { name: "Set background" }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Set background" }));
        await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
        expect(mocks.crop.mock.calls[0][1]).toEqual({ x: 400, y: 225, width: 800, height: 450 });
        expect(mocks.upload.mock.calls[0][0].name).toBe("background.webp");
    });

    it("retains the preview and presents an error when upload fails", async () => {
        mocks.upload.mockRejectedValueOnce(new Error("Upload limit reached"));
        setup(); pick();
        await screen.findByAltText("Preview of your background crop");
        await waitFor(() => expect((screen.getByRole("button", { name: "Set background" }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Set background" }));
        expect((await screen.findByRole("alert")).textContent).toBe("Upload limit reached");
        expect(screen.getByRole("dialog")).toBeTruthy();
    });
});
