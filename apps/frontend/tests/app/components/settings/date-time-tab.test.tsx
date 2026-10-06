import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateTimeTab } from "../../../../app/components/settings/tabs/DateTimeTab";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const { mutate, settings } = vi.hoisted(() => ({ mutate: vi.fn(), settings: { current: { dateTime: { timezone: "device" } } as any } }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: settings.current }), useUpdateSettings: () => ({ mutate }) }));
vi.mock("../../../../app/hooks/environment/use-holiday-overlay", () => ({ useHolidayOverlay: () => ({}) }));
vi.mock("../../../../app/hooks/calendar/use-personal-events", () => ({ usePersonalEvents: () => ({ items: [], enabled: true, setEnabled: vi.fn() }) }));
vi.mock("../../../../app/components/calendar/HolidayControls", () => ({ HolidayPreferencesPanel: () => null }));

const setup = () => render(<MemoryRouter><DateTimeTab /></MemoryRouter>);

describe("DateTimeTab time zone", () => {
    beforeEach(() => { mutate.mockClear(); settings.current = { dateTime: { timezone: "device" } }; setUserZone("America/Toronto"); });

    it("saves an IANA zone when one is picked", () => {
        setup();
        fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "Asia/Tokyo" } });
        expect(mutate).toHaveBeenCalledWith({ dateTime: { timezone: "Asia/Tokyo" } });
    });

    it("saves \"device\" when the device option is picked again", () => {
        settings.current = { dateTime: { timezone: "Asia/Tokyo" } };
        setup();
        fireEvent.change(screen.getByLabelText("Time zone"), { target: { value: "device" } });
        expect(mutate).toHaveBeenCalledWith({ dateTime: { timezone: "device" } });
    });

    it("narrows the list by search and offers UTC", () => {
        setup();
        expect(screen.getByRole("option", { name: "UTC" })).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Search time zones"), { target: { value: "tokyo" } });
        expect(screen.getByRole("option", { name: "Asia/Tokyo" })).toBeTruthy();
        expect(screen.queryByRole("option", { name: "Europe/Paris" })).toBeNull();
    });
});
