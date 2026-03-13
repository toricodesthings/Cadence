import { afterEach, describe, expect, it, vi } from "vitest";
import {
    fetchHolidays,
    fetchHolidaySubdivisions,
} from "../../../../app/lib/holidays/provider";

describe("holiday provider", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("uses OpenHolidays and filters out regional entries when no subdivision is selected", async () => {
        vi.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
            {
                startDate: "2026-01-01",
                name: [{ language: "EN", text: "New Year's Day" }],
                nationwide: true,
            },
            {
                startDate: "2026-01-06",
                name: [{ language: "EN", text: "Regional Day" }],
                nationwide: false,
                subdivisions: [{ code: "DE-BY" }],
            },
        ]), { status: 200 }));

        const holidays = await fetchHolidays({
            start: "2026-01-01",
            end: "2026-01-31",
            countryCode: "DE",
            subdivisionCode: null,
            locale: "en-US",
        });

        expect(holidays).toEqual([
            expect.objectContaining({
                date: "2026-01-01",
                name: "New Year's Day",
                countryCode: "DE",
                isRegional: false,
            }),
        ]);
    });

    it("falls back to Nager and keeps public subdivision holidays when OpenHolidays fails", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce(new Response("boom", { status: 500 }))
            .mockResolvedValueOnce(new Response(JSON.stringify([
                {
                    date: "2026-01-01",
                    localName: "New Year's Day",
                    name: "New Year's Day",
                    countryCode: "US",
                    global: true,
                    counties: null,
                    types: ["Public"],
                },
                {
                    date: "2026-02-12",
                    localName: "Lincoln's Birthday",
                    name: "Lincoln's Birthday",
                    countryCode: "US",
                    global: false,
                    counties: ["US-CA"],
                    types: ["Public"],
                },
            ]), { status: 200 }));

        const holidays = await fetchHolidays({
            start: "2026-01-01",
            end: "2026-12-31",
            countryCode: "US",
            subdivisionCode: "US-CA",
            locale: "en-US",
        });

        expect(holidays).toEqual([
            expect.objectContaining({ date: "2026-01-01", countryCode: "US" }),
            expect.objectContaining({ date: "2026-02-12", subdivisionCode: "US-CA", isRegional: true }),
        ]);
    });

    it("derives subdivision options from Nager when OpenHolidays has no subdivision endpoint", async () => {
        vi.spyOn(global, "fetch")
            .mockResolvedValueOnce(new Response("missing", { status: 404 }))
            .mockResolvedValueOnce(new Response(JSON.stringify([
                {
                    date: "2026-02-12",
                    localName: "Lincoln's Birthday",
                    name: "Lincoln's Birthday",
                    countryCode: "US",
                    global: false,
                    counties: ["US-CA", "US-NY"],
                    types: ["Public"],
                },
            ]), { status: 200 }));

        const subdivisions = await fetchHolidaySubdivisions("US", 2026, "en-US");

        expect(subdivisions).toEqual(
            expect.arrayContaining([
                { code: "US-CA", label: "California" },
                { code: "US-NY", label: "New York" },
            ]),
        );
    });
});
