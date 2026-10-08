import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DateTimeTab } from "../../../../app/components/settings/tabs/DateTimeTab";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const { mutate, settings, setHolidays } = vi.hoisted(() => ({ mutate: vi.fn(), setHolidays: vi.fn(), settings: { current: { dateTime: { timezone: "device" } } as any } }));
vi.mock("../../../../app/hooks/core/use-settings", () => ({ useSettings: () => ({ data: settings.current }), useUpdateSettings: () => ({ mutate }) }));
vi.mock("../../../../app/hooks/environment/use-holiday-overlay", () => ({
    HOLIDAY_SOURCE_LABELS: { manual: "chosen by you" },
    useHolidayOverlay: () => ({ enabled: true, setEnabled: setHolidays, regionLabel: "CA-ON, Canada", source: "manual" }),
}));
vi.mock("../../../../app/hooks/calendar/use-personal-events", () => ({ usePersonalEvents: () => ({ items: [], enabled: true, setEnabled: vi.fn() }) }));

const setup = () => render(<MemoryRouter><DateTimeTab /></MemoryRouter>);

describe("DateTimeTab time zone", () => {
    beforeEach(() => {
        mutate.mockClear(); settings.current = { dateTime: { timezone: "device" } }; setUserZone("America/Toronto");
        // jsdom has none of these; Radix Select reads them while opening.
        Element.prototype.scrollIntoView = vi.fn();
        Element.prototype.hasPointerCapture = vi.fn(() => false);
        Element.prototype.releasePointerCapture = vi.fn();
    });
    const open = () => fireEvent.keyDown(screen.getByRole("combobox", { name: "Time zone" }), { key: "Enter" });

    it("saves an IANA zone when one is picked", () => {
        setup(); open();
        fireEvent.click(screen.getByRole("option", { name: /^Asia\/Tokyo/ }));
        expect(mutate).toHaveBeenCalledWith({ dateTime: { timezone: "Asia/Tokyo" } });
    });

    it("saves \"device\" when the device option is picked again", () => {
        settings.current = { dateTime: { timezone: "Asia/Tokyo" } };
        setup(); open();
        fireEvent.click(screen.getByRole("option", { name: /^Device/ }));
        expect(mutate).toHaveBeenCalledWith({ dateTime: { timezone: "device" } });
    });

    it("narrows the list by search and offers UTC", () => {
        setup(); open();
        expect(screen.getByRole("option", { name: /^UTC/ })).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Search time zones"), { target: { value: "tokyo" } });
        expect(screen.getByRole("option", { name: /^Asia\/Tokyo/ })).toBeTruthy();
        expect(screen.queryByRole("option", { name: /^Europe\/Paris/ })).toBeNull();
    });
});

describe("DateTimeTab calendar", () => {
    beforeEach(() => { mutate.mockClear(); setHolidays.mockClear(); settings.current = { dateTime: { timezone: "device" } }; setUserZone("America/Toronto"); });

    it("saves the week start and time format from one tap each", () => {
        setup();
        fireEvent.click(screen.getByRole("radio", { name: "Mon" }));
        expect(mutate).toHaveBeenCalledWith({ dateTime: { weekStart: "Monday" } });
        fireEvent.click(screen.getByRole("radio", { name: "24-hour" }));
        expect(mutate).toHaveBeenCalledWith({ dateTime: { timeDisplay: "24h" } });
    });

    it("shows the hour the day and week views open at, 7 AM by default", () => {
        setup();
        expect(screen.getByLabelText("Hour the day and week views open at").textContent).toContain("7:00 AM");
    });

    it("turns a calendar layer off with its own switch", () => {
        setup();
        fireEvent.click(screen.getByRole("switch", { name: "Fixed blocks" }));
        expect(mutate).toHaveBeenCalledWith({ calendar: { clutter: { showFixed: false } } });
    });

    it("shows the holiday region beside its switch and in one row", () => {
        setup();
        expect(screen.getByText("CA-ON, Canada · chosen by you")).toBeTruthy();
        fireEvent.click(screen.getByRole("switch", { name: "Holidays" }));
        expect(setHolidays).toHaveBeenCalledWith(false);
        expect(screen.getByText("None yet")).toBeTruthy();
    });
});
