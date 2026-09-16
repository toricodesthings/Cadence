import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider as TooltipProvider } from "../../../app/components/primitives/Tooltip";
import { AppearanceTab } from "../../../app/components/settings/tabs/AppearanceTab";

const state = vi.hoisted(() => ({
    mode: "theme" as "theme" | "image",
    mutate: vi.fn(),
    image: { id: "photo-id", dominant: "#223344", swatches: ["#336699", "#993366"], accent: null, blur: 0, brightness: 80 },
}));
vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { appearance: {
        theme: "twilight", themePreset: "default", palette: "lantern", backgroundMode: state.mode,
        backgroundImage: state.image, backgroundColor: null, backgroundGradient: null,
        accentIntensity: "balanced", motion: "system", density: "comfortable",
    } } }),
    useUpdateSettings: () => ({ mutate: state.mutate }),
}));
vi.mock("../../../app/hooks/ui/use-background-image", () => ({
    useUploadBackgroundImage: () => ({ isPending: false, mutateAsync: vi.fn() }),
    useDeleteBackgroundImage: () => ({ isPending: false }),
    useBackgroundImageUrl: () => "blob:stored-photo",
}));
vi.mock("../../../app/hooks/ui/use-desktop-layout-scale", () => ({
    useDesktopLayoutScale: () => ({ layoutScale: "default", setLayoutScale: vi.fn() }),
}));

function setup() {
    return render(<MemoryRouter><TooltipProvider><AppearanceTab /></TooltipProvider></MemoryRouter>);
}
beforeEach(() => { state.mode = "theme"; state.mutate.mockClear(); });

describe("Appearance organization", () => {
    it("orders presets, accents, backgrounds and intensity, with one background source picker", () => {
        setup();
        expect(screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent)).toEqual([
            "Theme", "Curated Themes", "Accent Palette", "Background", "Accent intensity", "Motion", "Density",
        ]);
        expect(within(screen.getByRole("group", { name: "Background source" })).getAllByRole("button")).toHaveLength(2);
        expect(screen.getByRole("button", { name: "Theme default" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Ocean gradient" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Replace photo" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Ocean gradient" }));
        expect(state.mutate).toHaveBeenCalledWith({ appearance: { backgroundMode: "custom", backgroundGradient: "ocean", backgroundColor: null } });
    });

    it("disables Cadence palettes in photo mode and supports any photo accent", () => {
        state.mode = "image";
        setup();
        const palettes = screen.getByRole("group", { name: "Cadence accent palettes" });
        expect((palettes as HTMLFieldSetElement).disabled).toBe(true);
        expect(screen.getByText(/Photo selected. Choose an accent below/)).toBeTruthy();
        expect(screen.queryByRole("group", { name: "Cadence backgrounds" })).toBeNull();
        expect(screen.getAllByRole("img", { name: "Your background" })).toHaveLength(1);
        fireEvent.change(screen.getByLabelText("Custom photo accent"), { target: { value: "#abcdef" } });
        expect(state.mutate).toHaveBeenCalledWith({ appearance: { backgroundImage: { accent: "#abcdef" } } });
    });

    it("choosing a curated preset replaces photo mode and resets old background overrides", () => {
        state.mode = "image";
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Spring Bloom theme" }));
        expect(state.mutate).toHaveBeenCalledWith({ appearance: {
            themePreset: "spring-bloom", theme: "twilight", palette: "rose", backgroundMode: "theme",
            backgroundColor: null, backgroundGradient: null,
        } });
    });
});
