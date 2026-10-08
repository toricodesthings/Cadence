import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocationTab } from "../../../../app/components/settings/tabs/LocationTab";

const { location, forget, setManual } = vi.hoisted(() => ({ location: { current: {} as any }, forget: vi.fn(), setManual: vi.fn() }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: {} }), useUpdateSettings: () => ({ mutate: vi.fn() }) }));
vi.mock("../../../../app/hooks/auth/use-api-client", () => ({ useApiClient: () => ({}) }));
vi.mock("../../../../app/hooks/environment/use-user-location", () => ({ useUserLocation: () => location.current }));
vi.mock("../../../../app/hooks/environment/use-holiday-overlay", () => ({
    HOLIDAY_SOURCE_LABELS: { manual: "chosen by you" },
    useHolidayOverlay: () => ({ enabled: true, setEnabled: vi.fn(), regionLabel: "CA-ON, Canada", source: "manual", subdivisionLabel: null }),
}));
vi.mock("../../../../app/lib/holidays/provider", () => ({
    fetchHolidayCountries: async () => [{ code: "CA", label: "Canada" }, { code: "JP", label: "Japan" }],
    fetchHolidaySubdivisions: async () => [{ code: "CA-ON", label: "Ontario" }, { code: "CA-QC", label: "Quebec" }],
}));

const setup = () => render(<QueryClientProvider client={new QueryClient()}><LocationTab /></QueryClientProvider>);

describe("LocationTab", () => {
    beforeEach(() => {
        forget.mockClear(); setManual.mockClear();
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.hasPointerCapture = vi.fn(() => false);
        Element.prototype.releasePointerCapture = vi.fn();
        location.current = {
            mode: "manual", ready: true, place: { city: "Ottawa", subdivisionName: "Ontario", countryCode: "CA", source: "manual" },
            manualCountryCode: "CA", manualSubdivisionCode: "CA-ON", savedCity: { name: "Ottawa" }, refreshedAt: null,
            setMode: vi.fn(), setManualLocation: setManual, forgetLocation: forget,
        };
    });

    it("picks a country from a searchable list and clears the region", async () => {
        setup();
        fireEvent.keyDown(screen.getByRole("combobox", { name: "Country" }), { key: "Enter" });
        fireEvent.change(await screen.findByLabelText("Search countries"), { target: { value: "jap" } });
        fireEvent.click(await screen.findByRole("option", { name: "Japan" }));
        expect(setManual).toHaveBeenCalledWith({ countryCode: "JP", subdivisionCode: null });
    });

    it("shows the saved city with Change and Remove, and the chosen holiday region", () => {
        setup();
        expect(screen.getByText("Ottawa")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Change" }));
        expect(screen.getByLabelText("Search for a city")).toBeTruthy();
        expect(screen.getByText("CA-ON, Canada · chosen by you")).toBeTruthy();
    });

    it("forgets the saved location from the privacy section", () => {
        setup();
        fireEvent.click(screen.getByRole("button", { name: "Forget saved location" }));
        expect(forget).toHaveBeenCalled();
    });
});
