import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestApp } from "../helpers/app";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { proxyRoutes } from "../../src/domains/proxy/proxy.route";

const app = createTestApp("/proxy", proxyRoutes);

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("proxy route contracts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── Weather ──

    describe("GET /proxy/weather", () => {
        it("returns only the current conditions from upstream", async () => {
            const upstream = { current_weather: { temperature: 22, weathercode: 1, windspeed: 9 }, hourly: {} };
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request("/proxy/weather?latitude=40.7&longitude=-74.0");

            expect(res.status).toBe(200);
            expect(res.headers.get("cache-control")).toContain("no-store");
            const body: any = await res.json();
            expect(body).toEqual({ data: { temperature: 22, weatherCode: 1 } });
            expect(fetchMock).toHaveBeenCalledOnce();
            expect(fetchMock.mock.calls[0][0]).toContain("api.open-meteo.com");
        });

        it("rounds coordinates before calling upstream", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ current_weather: { temperature: 5, weathercode: 3 } }));

            await app.request("/proxy/weather?latitude=43.653226&longitude=-79.383184");

            const url = String(fetchMock.mock.calls[0][0]);
            expect(url).toContain("latitude=43.65&");
            expect(url).toContain("longitude=-79.38&");
        });

        it("returns 502 when upstream has no current conditions", async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));

            const res = await app.request("/proxy/weather?latitude=10&longitude=20");

            expect(res.status).toBe(502);
        });

        it("returns 502 when upstream fails", async () => {
            fetchMock.mockResolvedValue(jsonResponse({}, 503));

            const res = await app.request("/proxy/weather?latitude=10&longitude=20");

            expect(res.status).toBe(502);
            const body: any = await res.json();
            expect(body.error.code).toBe("UPSTREAM_ERROR");
        });

        it("returns 400 for missing latitude", async () => {
            const res = await app.request("/proxy/weather?longitude=20");
            expect(res.status).toBe(400);
        });

        it("returns 400 for out-of-range latitude", async () => {
            const res = await app.request("/proxy/weather?latitude=91&longitude=20");
            expect(res.status).toBe(400);
        });

        it("returns 400 for out-of-range longitude", async () => {
            const res = await app.request("/proxy/weather?latitude=45&longitude=181");
            expect(res.status).toBe(400);
        });
    });

    // ── Geocode ──

    describe("GET /proxy/geocode/reverse", () => {
        it("returns country and subdivision from upstream", async () => {
            const upstream = {
                address: { country_code: "us", state: "New York", county: "Kings", "ISO3166-2-lvl4": "US-NY" },
            };
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request("/proxy/geocode/reverse?latitude=40.7128&longitude=-74.006");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual({ countryCode: "US", subdivisionCode: "US-NY", subdivisionName: "New York" });
            const url = String(fetchMock.mock.calls[0][0]);
            expect(url).toContain("nominatim.openstreetmap.org");
            expect(url).toContain("lat=40.71&lon=-74.01&");
        });

        it("returns nulls when address is missing", async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));

            const res = await app.request("/proxy/geocode/reverse?latitude=0&longitude=0");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual({ countryCode: null, subdivisionCode: null, subdivisionName: null });
        });

        it("returns 502 when upstream fails", async () => {
            fetchMock.mockResolvedValue(jsonResponse({}, 500));

            const res = await app.request("/proxy/geocode/reverse?latitude=10&longitude=20");

            expect(res.status).toBe(502);
        });

        it("returns 400 for missing params", async () => {
            const res = await app.request("/proxy/geocode/reverse");
            expect(res.status).toBe(400);
        });
    });

    describe("GET /proxy/geocode/search", () => {
        it("maps upstream results to rounded city options", async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                results: [
                    { name: "Toronto", latitude: 43.70011, longitude: -79.4163, country: "Canada", country_code: "CA", admin1: "Ontario" },
                ],
            }));

            const res = await app.request("/proxy/geocode/search?name=Toronto&locale=en-CA");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual([
                { name: "Toronto", region: "Ontario", country: "Canada", countryCode: "CA", latitude: 43.7, longitude: -79.42 },
            ]);
            const url = String(fetchMock.mock.calls[0][0]);
            expect(url).toContain("geocoding-api.open-meteo.com");
            expect(url).toContain("language=en");
        });

        it("returns an empty list when upstream has no results", async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));

            const res = await app.request("/proxy/geocode/search?name=Nowhere");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual([]);
        });

        it("returns 400 for a too-short query", async () => {
            const res = await app.request("/proxy/geocode/search?name=a");
            expect(res.status).toBe(400);
        });
    });

    // ── Approximate location ──

    describe("GET /proxy/geo/approximate", () => {
        function requestWithEdgeGeo(cf: Record<string, unknown> | undefined) {
            const req = new Request("http://localhost/proxy/geo/approximate");
            if (cf) Object.defineProperty(req, "cf", { value: cf });
            return app.request(req);
        }

        it("returns city-level location from the edge without calling upstream", async () => {
            const res = await requestWithEdgeGeo({
                country: "CA",
                regionCode: "ON",
                region: "Ontario",
                city: "Toronto",
                latitude: "43.65323",
                longitude: "-79.38318",
            });

            expect(res.status).toBe(200);
            expect(res.headers.get("cache-control")).toContain("no-store");
            const body: any = await res.json();
            expect(body.data).toEqual({
                countryCode: "CA",
                subdivisionCode: "CA-ON",
                subdivisionName: "Ontario",
                city: "Toronto",
                coordinates: { latitude: 43.65, longitude: -79.38 },
            });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("returns nulls when the edge has no geo data", async () => {
            const res = await requestWithEdgeGeo(undefined);

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual({
                countryCode: null,
                subdivisionCode: null,
                subdivisionName: null,
                city: null,
                coordinates: null,
            });
        });

        it("treats unknown and Tor countries as no country", async () => {
            for (const country of ["XX", "T1"]) {
                const res = await requestWithEdgeGeo({ country, regionCode: "ON" });
                const body: any = await res.json();
                expect(body.data.countryCode).toBeNull();
                expect(body.data.subdivisionCode).toBeNull();
            }
        });
    });

    // ── Holiday Countries ──

    describe("GET /proxy/holidays/countries", () => {
        it("merges countries from both providers", async () => {
            const openHolidays = [
                { isoCode: "DE", name: [{ language: "EN", text: "Germany" }] },
            ];
            const nager = [
                { countryCode: "US", name: "United States" },
                { countryCode: "DE", name: "Germany (Nager)" },
            ];
            fetchMock
                .mockResolvedValueOnce(jsonResponse(openHolidays))
                .mockResolvedValueOnce(jsonResponse(nager));

            const res = await app.request("/proxy/holidays/countries?locale=en");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            // OpenHolidays should override Nager for DE
            const de = body.data.find((c: any) => c.code === "DE");
            expect(de.label).toBe("Germany");
            // US should come from Nager
            const us = body.data.find((c: any) => c.code === "US");
            expect(us.label).toBe("United States");
        });

        it("handles upstream failures gracefully", async () => {
            fetchMock
                .mockRejectedValueOnce(new Error("network"))
                .mockRejectedValueOnce(new Error("network"));

            const res = await app.request("/proxy/holidays/countries");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual([]);
        });

        it("defaults locale when not provided", async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse([]))
                .mockResolvedValueOnce(jsonResponse([]));

            const res = await app.request("/proxy/holidays/countries");

            expect(res.status).toBe(200);
            expect(fetchMock.mock.calls[0][0]).toContain("languageIsoCode=EN");
        });
    });

    // ── Holiday Subdivisions ──

    describe("GET /proxy/holidays/subdivisions", () => {
        it("returns subdivisions from OpenHolidays", async () => {
            const upstream = [
                { code: "US-NY", name: [{ language: "EN", text: "New York" }] },
                { code: "US-CA", name: [{ language: "EN", text: "California" }] },
            ];
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request(
                "/proxy/holidays/subdivisions?countryCode=US&year=2026&locale=en",
            );

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toHaveLength(2);
            expect(body.data[0].code).toBe("US-CA");
            expect(body.data[1].code).toBe("US-NY");
        });

        it("falls back to Nager when OpenHolidays fails", async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse({}, 500))
                .mockResolvedValueOnce(
                    jsonResponse([
                        { types: ["Public"], counties: ["US-NY", "US-CA"] },
                        { types: ["Public"], counties: null },
                    ]),
                );

            const res = await app.request(
                "/proxy/holidays/subdivisions?countryCode=US&year=2026&locale=en",
            );

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data.length).toBeGreaterThan(0);
        });

        it("returns 400 for missing countryCode", async () => {
            const res = await app.request("/proxy/holidays/subdivisions?year=2026");
            expect(res.status).toBe(400);
        });

        it("returns 400 for year out of range", async () => {
            const res = await app.request(
                "/proxy/holidays/subdivisions?countryCode=US&year=1999",
            );
            expect(res.status).toBe(400);
        });
    });

    // ── Holidays ──

    describe("GET /proxy/holidays", () => {
        it("returns holidays from OpenHolidays", async () => {
            const upstream = [
                {
                    startDate: "2026-01-01",
                    name: [{ language: "EN", text: "New Year" }],
                    nationwide: true,
                    subdivisions: [],
                },
            ];
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request(
                "/proxy/holidays?countryCode=US&start=2026-01-01&end=2026-12-31&locale=en",
            );

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toHaveLength(1);
            expect(body.data[0].name).toBe("New Year");
            expect(body.data[0].date).toBe("2026-01-01");
        });

        it("falls back to Nager when OpenHolidays returns empty", async () => {
            // OpenHolidays returns no holidays (nationwide only, none match)
            fetchMock.mockResolvedValueOnce(jsonResponse([]));
            // Nager fallback
            fetchMock.mockResolvedValueOnce(
                jsonResponse([
                    {
                        date: "2026-01-01",
                        localName: "Neujahr",
                        name: "New Year",
                        countryCode: "DE",
                        global: true,
                        counties: null,
                        types: ["Public"],
                    },
                ]),
            );

            const res = await app.request(
                "/proxy/holidays?countryCode=DE&start=2026-01-01&end=2026-12-31&locale=de",
            );

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data.length).toBeGreaterThan(0);
            expect(body.data[0].name).toBe("New Year");
            expect(body.data[0].localName).toBe("Neujahr");
        });

        it("filters regional holidays when no subdivisionCode given", async () => {
            const upstream = [
                {
                    startDate: "2026-01-01",
                    name: [{ language: "EN", text: "National Day" }],
                    nationwide: true,
                    subdivisions: [],
                },
                {
                    startDate: "2026-03-15",
                    name: [{ language: "EN", text: "State Day" }],
                    nationwide: false,
                    subdivisions: [{ code: "US-NY" }],
                },
            ];
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request(
                "/proxy/holidays?countryCode=US&start=2026-01-01&end=2026-12-31&locale=en",
            );

            const body: any = await res.json();
            expect(body.data).toHaveLength(1);
            expect(body.data[0].name).toBe("National Day");
        });

        it("includes regional holidays matching subdivisionCode", async () => {
            const upstream = [
                {
                    startDate: "2026-03-15",
                    name: [{ language: "EN", text: "State Day" }],
                    nationwide: false,
                    subdivisions: [{ code: "US-NY" }],
                },
            ];
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request(
                "/proxy/holidays?countryCode=US&start=2026-01-01&end=2026-12-31&subdivisionCode=US-NY&locale=en",
            );

            const body: any = await res.json();
            expect(body.data).toHaveLength(1);
            expect(body.data[0].name).toBe("State Day");
        });

        it("returns 400 for invalid date format", async () => {
            const res = await app.request(
                "/proxy/holidays?countryCode=US&start=2026-1-1&end=2026-12-31",
            );
            expect(res.status).toBe(400);
        });

        it("returns 400 for missing required params", async () => {
            const res = await app.request("/proxy/holidays?countryCode=US");
            expect(res.status).toBe(400);
        });
    });
});
