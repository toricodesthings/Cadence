import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createRequestContext } from "../../src/platform/request-log";
import type { AuthVariables } from "../../src/platform/auth";
import { formatErrorResponse } from "../../src/platform/errors";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { proxyRoutes } from "../../src/domains/proxy/proxy.route";

const TEST_USER_ID = "11111111-1111-4111-8111-111111111111";

function createProxyApp() {
    const app = new Hono<{ Variables: AuthVariables }>();
    app.onError((err, c) => {
        const res = formatErrorResponse(err);
        return c.json(res.body, res.status as 500);
    });
    app.use("*", createRequestContext());
    app.use("*", async (c, next) => {
        c.set("userId", TEST_USER_ID);
        await next();
    });
    app.route("/proxy", proxyRoutes as any);
    return app;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("proxy route contracts", () => {
    let app: ReturnType<typeof createProxyApp>;

    beforeEach(() => {
        vi.clearAllMocks();
        app = createProxyApp();
    });

    // ── Weather ──

    describe("GET /proxy/weather", () => {
        it("returns weather data from upstream", async () => {
            const upstream = { current_weather: { temperature: 22, weathercode: 1 } };
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request("/proxy/weather?latitude=40.7&longitude=-74.0");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body).toEqual({ data: upstream });
            expect(fetchMock).toHaveBeenCalledOnce();
            expect(fetchMock.mock.calls[0][0]).toContain("api.open-meteo.com");
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
                address: { country_code: "us", state: "New York", county: "Kings" },
            };
            fetchMock.mockResolvedValue(jsonResponse(upstream));

            const res = await app.request("/proxy/geocode/reverse?latitude=40.7&longitude=-74.0");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual({ countryCode: "US", subdivisionName: "New York" });
            expect(fetchMock.mock.calls[0][0]).toContain("nominatim.openstreetmap.org");
        });

        it("returns nulls when address is missing", async () => {
            fetchMock.mockResolvedValue(jsonResponse({}));

            const res = await app.request("/proxy/geocode/reverse?latitude=0&longitude=0");

            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.data).toEqual({ countryCode: null, subdivisionName: null });
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
