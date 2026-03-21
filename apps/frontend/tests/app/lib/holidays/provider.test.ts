import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    fetchHolidays,
    fetchHolidaySubdivisions,
} from "../../../../app/lib/holidays/provider";

const authenticatedFetchMock = vi.fn();

vi.mock("../../../../app/lib/api/client", () => ({
    authenticatedFetch: (...args: Parameters<typeof authenticatedFetchMock>) => authenticatedFetchMock(...args),
}));

describe("holiday provider", () => {
    beforeEach(() => {
        authenticatedFetchMock.mockReset();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("requests holidays through the authenticated proxy and returns the normalized payload", async () => {
        authenticatedFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
            data: [
                {
                    date: "2026-01-01",
                    name: "New Year's Day",
                    countryCode: "DE",
                    subdivisionCode: null,
                    isRegional: false,
                },
            ],
        }), { status: 200 }));

        const holidays = await fetchHolidays({
            start: "2026-01-01",
            end: "2026-01-31",
            countryCode: "DE",
            subdivisionCode: null,
            locale: "en-US",
        });

        expect(authenticatedFetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/v1/proxy/holidays?"),
            expect.objectContaining({ authenticated: true }),
        );
        expect(holidays).toEqual([
            expect.objectContaining({
                date: "2026-01-01",
                name: "New Year's Day",
                countryCode: "DE",
                isRegional: false,
            }),
        ]);
    });

    it("passes subdivision selection through to the authenticated holiday proxy", async () => {
        authenticatedFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
            data: [
                {
                    date: "2026-01-01",
                    name: "New Year's Day",
                    countryCode: "US",
                    subdivisionCode: null,
                    isRegional: false,
                },
                {
                    date: "2026-02-12",
                    name: "Lincoln's Birthday",
                    countryCode: "US",
                    subdivisionCode: "US-CA",
                    isRegional: true,
                },
            ],
        }), { status: 200 }));

        const holidays = await fetchHolidays({
            start: "2026-01-01",
            end: "2026-12-31",
            countryCode: "US",
            subdivisionCode: "US-CA",
            locale: "en-US",
        });

        expect(authenticatedFetchMock).toHaveBeenCalledWith(
            expect.stringContaining("subdivisionCode=US-CA"),
            expect.objectContaining({ authenticated: true }),
        );
        expect(holidays).toEqual([
            expect.objectContaining({ date: "2026-01-01", countryCode: "US" }),
            expect.objectContaining({ date: "2026-02-12", subdivisionCode: "US-CA", isRegional: true }),
        ]);
    });

    it("falls back to static subdivisions when the proxy lookup fails", async () => {
        authenticatedFetchMock.mockRejectedValueOnce(new Error("missing"));

        const subdivisions = await fetchHolidaySubdivisions("US", 2026, "en-US");

        expect(subdivisions).toEqual(
            expect.arrayContaining([
                { code: "US-CA", label: "California" },
                { code: "US-NY", label: "New York" },
            ]),
        );
    });
});
