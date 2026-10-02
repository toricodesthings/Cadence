import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHolidayOverlay } from "../../../app/hooks/environment/use-holiday-overlay";
import { testQueryClient, withClient } from "../../helpers";

const { fetchHolidays, fetchHolidaySubdivisions, location, preferences } = vi.hoisted(() => ({
    fetchHolidays: vi.fn(),
    fetchHolidaySubdivisions: vi.fn(),
    location: { place: { countryCode: "CA", subdivisionCode: "CA-ON", subdivisionName: "Ontario", source: "manual" }, isResolving: false },
    preferences: { enabled: true, locale: "en-CA" },
}));

vi.mock("../../../app/hooks/core/use-settings", () => ({
    useSettings: () => ({ data: { calendar: { holidays: { enabled: preferences.enabled } } } }),
    useUpdateSettings: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../../app/hooks/environment/use-user-location", () => ({ useUserLocation: () => location }));
vi.mock("../../../app/lib/holidays/provider", () => ({ fetchHolidays, fetchHolidaySubdivisions }));
vi.mock("../../../app/lib/holidays/location-resolver", async (importOriginal) => ({
    ...await importOriginal<typeof import("../../../app/lib/holidays/location-resolver")>(),
    getPreferredLocale: () => preferences.locale,
}));

type Options = Parameters<typeof useHolidayOverlay>[0];
const january: Options = { start: "2026-01-01", end: "2026-01-31", viewMode: "month" };

beforeEach(() => {
    preferences.enabled = true;
    preferences.locale = "en-CA";
    location.isResolving = false;
    location.place = { countryCode: "CA", subdivisionCode: "CA-ON", subdivisionName: "Ontario", source: "manual" };
    fetchHolidaySubdivisions.mockReset().mockResolvedValue([{ code: "CA-ON", label: "Ontario" }]);
    fetchHolidays.mockReset().mockImplementation(async ({ start, countryCode, subdivisionCode }) => [
        { date: start, name: "New Year", countryCode, subdivisionCode, isRegional: false },
        { date: `${start.slice(0, 4)}-02-16`, name: "Family Day", countryCode, subdivisionCode, isRegional: true },
    ]);
});

describe("holiday year caching", () => {
    it("reuses a year across ranges, views and remounts while returning only visible dates", async () => {
        const client = testQueryClient();
        const wrapper = withClient(client);
        const { result, rerender, unmount } = renderHook((options: Options) => useHolidayOverlay(options), { initialProps: january, wrapper });
        await waitFor(() => expect(result.current.holidays).toHaveLength(1));
        expect(fetchHolidays).toHaveBeenCalledWith(expect.objectContaining({ start: "2026-01-01", end: "2026-12-31" }));

        rerender({ start: "2026-02-01", end: "2026-02-28", viewMode: "month" });
        expect(result.current.holidays.map((holiday) => holiday.name)).toEqual(["Family Day"]);
        rerender({ start: "2026-02-16", end: "2026-02-16", viewMode: "day" });
        expect(result.current.holidayDateSet.has("2026-02-16")).toBe(true);
        unmount();

        const reopened = renderHook(() => useHolidayOverlay(january), { wrapper });
        expect(reopened.result.current.holidays).toHaveLength(1);
        expect(fetchHolidays).toHaveBeenCalledTimes(1);
    });

    it("loads both years at New Year, then reuses them for January", async () => {
        const { result, rerender } = renderHook((options: Options) => useHolidayOverlay(options), {
            initialProps: { start: "2026-12-28", end: "2027-01-03", viewMode: "week" } as Options,
            wrapper: withClient(),
        });
        await waitFor(() => expect(result.current.holidays.map((holiday) => holiday.date)).toEqual(["2027-01-01"]));
        expect(fetchHolidays).toHaveBeenCalledTimes(2);
        rerender({ start: "2027-01-01", end: "2027-01-31", viewMode: "month" });
        expect(result.current.holidays).toHaveLength(1);
        expect(fetchHolidays).toHaveBeenCalledTimes(2);
    });

    it("selects new data when the region, country or language changes", async () => {
        const { result, rerender } = renderHook(() => useHolidayOverlay(january), { wrapper: withClient() });
        await waitFor(() => expect(result.current.holidays[0]?.subdivisionCode).toBe("CA-ON"));
        location.place.subdivisionCode = "CA-QC";
        rerender();
        expect(result.current.holidays).toEqual([]);
        await waitFor(() => expect(result.current.holidays[0]?.subdivisionCode).toBe("CA-QC"));

        preferences.locale = "fr-CA";
        rerender();
        await waitFor(() => expect(fetchHolidays).toHaveBeenCalledTimes(3));
        expect(fetchHolidays.mock.lastCall?.[0].locale).toBe("fr-CA");
        location.place = { countryCode: "US", subdivisionCode: "US-NY", subdivisionName: "New York", source: "manual" };
        rerender();
        await waitFor(() => expect(result.current.holidays[0]?.countryCode).toBe("US"));
        expect(fetchHolidays).toHaveBeenCalledTimes(4);
    });

    it("waits for location resolution and respects the holiday toggle", async () => {
        location.isResolving = true;
        const { result, rerender } = renderHook(() => useHolidayOverlay(january), { wrapper: withClient() });
        expect(fetchHolidays).not.toHaveBeenCalled();
        preferences.enabled = false;
        location.isResolving = false;
        rerender();
        expect(fetchHolidays).not.toHaveBeenCalled();
        preferences.enabled = true;
        rerender();
        await waitFor(() => expect(result.current.holidays).toHaveLength(1));
    });

    it("refreshes after seven days rather than holding dates indefinitely", async () => {
        const now = Date.now();
        const clock = vi.spyOn(Date, "now").mockReturnValue(now);
        const client = testQueryClient();
        const wrapper = withClient(client);
        const first = renderHook(() => useHolidayOverlay(january), { wrapper });
        await waitFor(() => expect(first.result.current.holidays).toHaveLength(1));
        first.unmount();
        clock.mockReturnValue(now + 8 * 86400_000);
        await act(async () => { renderHook(() => useHolidayOverlay(january), { wrapper }); });
        await waitFor(() => expect(fetchHolidays).toHaveBeenCalledTimes(2));
    });
});
