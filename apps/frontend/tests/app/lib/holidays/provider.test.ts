import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    fetchHolidays,
    fetchHolidaySubdivisions,
} from "../../../../app/lib/holidays/provider";

const fetchMock = vi.fn();

// The real RPC client, over a fake fetch: the test sees the URL it builds.
vi.mock("../../../../app/lib/api/client", async () => {
    const { hc } = await import("hono/client");
    const { api } = hc<import("@cadence/backend").AppType>("http://api.test", {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchMock(String(input), init),
    });
    return { apiClient: { api: api.v1 } };
});

describe("holiday provider", () => {
    beforeEach(() => {
        fetchMock.mockReset();
    });

    it("requests holidays through the authenticated proxy and returns the normalized payload", async () => {
        fetchMock.mockResolvedValueOnce(Response.json({
            data: [
                {
                    date: "2026-01-01",
                    name: "New Year's Day",
                    countryCode: "DE",
                    subdivisionCode: null,
                    isRegional: false,
                },
            ],
        }));

        const holidays = await fetchHolidays({
            start: "2026-01-01",
            end: "2026-01-31",
            countryCode: "DE",
            subdivisionCode: null,
            locale: "en-US",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("/api/v1/proxy/holidays?"),
            expect.anything(),
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
        fetchMock.mockResolvedValueOnce(Response.json({
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
        }));

        const holidays = await fetchHolidays({
            start: "2026-01-01",
            end: "2026-12-31",
            countryCode: "US",
            subdivisionCode: "US-CA",
            locale: "en-US",
        });

        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining("subdivisionCode=US-CA"),
            expect.anything(),
        );
        expect(holidays).toEqual([
            expect.objectContaining({ date: "2026-01-01", countryCode: "US" }),
            expect.objectContaining({ date: "2026-02-12", subdivisionCode: "US-CA", isRegional: true }),
        ]);
    });

    it("falls back to static subdivisions when the proxy lookup fails", async () => {
        fetchMock.mockRejectedValueOnce(new Error("missing"));

        const subdivisions = await fetchHolidaySubdivisions("US", 2026, "en-US");

        expect(subdivisions).toEqual(
            expect.arrayContaining([
                { code: "US-CA", label: "California" },
                { code: "US-NY", label: "New York" },
            ]),
        );
    });
});
