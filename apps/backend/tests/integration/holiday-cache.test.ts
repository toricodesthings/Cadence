import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { proxyRoutes } from "../../src/domains/proxy/proxy.route";

const fetchMock = vi.fn();
const objects = new Map<string, Response>();
const cache = {
    match: vi.fn(async (key: Request) => objects.get(key.url)?.clone()),
    put: vi.fn(async (key: Request, response: Response) => { objects.set(key.url, response.clone()); }),
};
const api = apiAs("user-a", "/proxy", proxyRoutes);
const january = "/holidays?countryCode=CA&start=2026-01-01&end=2026-12-31&subdivisionCode=CA-ON&locale=en-CA";

beforeEach(() => {
    objects.clear();
    vi.clearAllMocks();
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async (input: string) => {
        const url = new URL(input);
        return Response.json([{
            startDate: url.searchParams.get("validFrom"),
            name: [{ language: "EN", text: "New Year" }],
            nationwide: true,
            subdivisions: [],
        }]);
    });
});
afterEach(() => vi.unstubAllGlobals());

describe("public holiday edge cache", () => {
    it("serves a repeat request without upstream calls and shares only public data between users", async () => {
        const first = await api("GET", january, undefined, { Authorization: "Bearer first-user" });
        expect(first.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const second = await apiAs("user-b", "/proxy", proxyRoutes)("GET",
            "/holidays?locale=en-CA&subdivisionCode=CA-ON&end=2026-12-31&start=2026-01-01&countryCode=CA",
            undefined, { Authorization: "Bearer second-user" });
        expect(second.body).toEqual(first.body);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(cache.put).toHaveBeenCalledTimes(1);
        const [key, stored] = cache.put.mock.calls[0];
        expect([...key.headers]).toEqual([]);
        expect([...stored.headers.keys()]).toEqual(["cache-control", "content-type"]);
        expect(stored.headers.get("cache-control")).toContain("max-age=604800");
    });

    it("keeps country, region, language and dates in separate entries", async () => {
        for (const path of [january, january.replace("CA-ON", "CA-QC"), january.replace("en-CA", "fr-CA"),
            january.replaceAll("2026", "2027"), january.replace("countryCode=CA", "countryCode=US")]) {
            expect((await api("GET", path)).status).toBe(200);
        }
        expect(fetchMock).toHaveBeenCalledTimes(5);
        expect(objects.size).toBe(5);
    });

    it("does not turn a provider outage into a week of cached missing holidays", async () => {
        fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 }))
            .mockResolvedValueOnce(Response.json({}, { status: 503 }));
        const failed = await api("GET", january);
        expect(failed.status).toBe(502);
        expect(failed.body.error.isRetryable).toBe(true);
        expect(cache.put).not.toHaveBeenCalled();
        expect(fetchMock.mock.calls[0][1].cf.cacheTtlByStatus["300-599"]).toBe(0);

        const recovered = await api("GET", january);
        expect(recovered.status).toBe(200);
        expect(recovered.body.data).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("caches a genuinely empty successful result", async () => {
        fetchMock.mockImplementation(async () => Response.json([]));
        expect((await api("GET", january)).body.data).toEqual([]);
        expect((await api("GET", january)).body.data).toEqual([]);
        expect(fetchMock).toHaveBeenCalledTimes(2); // primary and fallback, once each
        expect(cache.put).toHaveBeenCalledTimes(1);
    });

    it("does not cache partial country lists during an outage", async () => {
        fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 }))
            .mockResolvedValueOnce(Response.json([{ countryCode: "CA", name: "Canada" }]));
        const result = await api("GET", "/holidays/countries?locale=en");
        expect(result.status).toBe(200);
        expect(result.body.data).toEqual([{ code: "CA", label: "Canada" }]);
        expect(result.response.headers.get("cache-control")).toContain("no-store");
        expect(cache.put).not.toHaveBeenCalled();
    });

    it("continues serving holidays when cache reads or writes fail", async () => {
        cache.match.mockRejectedValueOnce(new Error("cache unavailable"));
        cache.put.mockRejectedValueOnce(new Error("cache unavailable"));
        expect((await api("GET", january)).status).toBe(200);
    });

    it("does not cache weather or malformed holiday queries", async () => {
        fetchMock.mockImplementation(async () => Response.json({ current_weather: { temperature: 10, weathercode: 1 } }));
        await api("GET", "/weather?latitude=0&longitude=0");
        await api("GET", "/weather?latitude=0&longitude=0");
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect((await api("GET", "/holidays?countryCode=CA")).status).toBe(400);
        expect(cache.put).not.toHaveBeenCalled();
    });

    it("does not serve a cached GET response for an unsupported HTTP method", async () => {
        await api("GET", january);
        expect((await api("POST", january)).status).toBe(404);
        expect(cache.match).toHaveBeenCalledTimes(1);
    });
});
