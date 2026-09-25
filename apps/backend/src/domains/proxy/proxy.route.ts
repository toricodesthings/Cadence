import { Hono } from "hono";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { createErrorBody } from "../../platform/errors";
import { logger, shorten, issuesFromError } from "../../platform/log";
import {
    coordsQuerySchema,
    geocodeSearchQuerySchema,
    holidayCountriesQuerySchema,
    holidaySubdivisionsQuerySchema,
    holidaysQuerySchema,
    type ApproximatePlace,
    type CityResult,
    type HolidayCountryOption,
    type HolidayRecord,
    type HolidaySubdivisionOption,
    type RegionInfo,
    type WeatherReading,
} from "@cadence/contracts/proxy";

// ── Helpers ──

const OPEN_METEO_BASE = "https://api.open-meteo.com";
const OPEN_METEO_GEOCODING_BASE = "https://geocoding-api.open-meteo.com";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OPEN_HOLIDAYS_BASE = "https://openholidaysapi.org";
const NAGER_BASE = "https://date.nager.at/api/v3";

const MAX_UPSTREAM_BODY = 1_048_576; // 1MB
const ALLOWED_CONTENT_TYPES = ["application/json", "text/plain"];

/**
 * Single choke point for all third-party fetches. Every upstream failure mode —
 * network error, unexpected content type, oversize body, or non-2xx status — is
 * logged here once with the named `upstream`, so an outage shows up immediately
 * in Observability as `event:upstream_failed` rather than a silent 502.
 */
async function upstreamFetch(upstream: string, url: string, cacheTtl: number): Promise<Response> {
    let res: Response;
    try {
        res = await fetch(url, {
            headers: { "User-Agent": "Cadence/1.0 (cadenceapp.cloud)" },
            cf: { cacheTtl, cacheEverything: true },
        });
    } catch (err) {
        logger.error("proxy", "upstream_unreachable", { upstream, issues: issuesFromError(err) });
        throw err;
    }

    // Validate upstream response content-type
    const ct = res.headers.get("content-type") || "";
    if (!ALLOWED_CONTENT_TYPES.some((t) => ct.includes(t))) {
        logger.error("proxy", "upstream_bad_response", { upstream, status: res.status, reason: "content_type", contentType: shorten(ct) });
        return new Response(JSON.stringify({ error: { code: "UPSTREAM_ERROR", message: "Unexpected content type from upstream" } }), { status: 502 });
    }

    // Reject oversized upstream responses
    const cl = res.headers.get("content-length");
    if (cl && parseInt(cl, 10) > MAX_UPSTREAM_BODY) {
        logger.error("proxy", "upstream_bad_response", { upstream, status: res.status, reason: "oversize", contentLength: parseInt(cl, 10) });
        return new Response(JSON.stringify({ error: { code: "UPSTREAM_ERROR", message: "Upstream response too large" } }), { status: 502 });
    }

    if (!res.ok) {
        logger.error("proxy", "upstream_failed", { upstream, status: res.status });
    }

    return res;
}

function cacheHeaders(maxAge: number): Record<string, string> {
    return {
        "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
    };
}

/**
 * Restrictive cache headers for authenticated responses containing user-sensitive
 * or location-derived data. Prevents browsers and intermediate proxies from caching
 * personalised content per OWASP Session Management and Transport Layer Security guidance.
 */
const PRIVATE_NO_STORE: Record<string, string> = {
    "Cache-Control": "private, no-store, max-age=0",
};

/**
 * Round to 2 decimals (~1.1 km). Weather and regions need no more, and shared
 * upstream URLs let the edge cache serve nearby users.
 */
function roundCoordinate(value: number): number {
    return Math.round(value * 100) / 100;
}

function parseEdgeCoordinate(value: string | undefined, limit: number): number | null {
    const parsed = Number.parseFloat(value ?? "");
    if (!Number.isFinite(parsed) || Math.abs(parsed) > limit) return null;
    return roundCoordinate(parsed);
}

/** Cloudflare reports "XX" for unknown and "T1" for Tor; neither is a country. */
function parseEdgeCountry(value: string | undefined): string | null {
    const code = value?.toUpperCase();
    if (!code || !/^[A-Z]{2}$/.test(code) || code === "XX") return null;
    return code;
}

function getLanguage(locale: string): string {
    return locale.split("-")[0]?.toUpperCase() || "EN";
}

export const proxyRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── GET /api/proxy/weather ──
    // Short cache: weather changes frequently
    .get("/weather", apiValidator("query", coordsQuerySchema), async (c) => {
        const { latitude, longitude } = c.req.valid("query");
        const url = `${OPEN_METEO_BASE}/v1/forecast?latitude=${roundCoordinate(latitude)}&longitude=${roundCoordinate(longitude)}&current_weather=true&temperature_unit=celsius`;

        const res = await upstreamFetch("open-meteo", url, 900); // 15 min CF cache
        if (!res.ok) {
            return c.json(createErrorBody({ code: "UPSTREAM_ERROR", message: "Weather service unavailable", status: 502 }), 502);
        }

        const payload = (await res.json()) as { current_weather?: { temperature?: unknown; weathercode?: unknown } };
        const current = payload.current_weather;
        if (typeof current?.temperature !== "number" || typeof current.weathercode !== "number") {
            return c.json(createErrorBody({ code: "UPSTREAM_ERROR", message: "Weather service returned no current conditions", status: 502 }), 502);
        }

        return c.json(
            { data: { temperature: current.temperature, weatherCode: current.weathercode } satisfies WeatherReading },
            200,
            PRIVATE_NO_STORE,
        );
    })

    // ── GET /api/proxy/geocode/reverse ──
    // Long cache: a lat/lon mapping rarely changes
    .get("/geocode/reverse", apiValidator("query", coordsQuerySchema), async (c) => {
        const { latitude, longitude } = c.req.valid("query");
        const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${roundCoordinate(latitude)}&lon=${roundCoordinate(longitude)}&zoom=5&addressdetails=1`;

        const res = await upstreamFetch("nominatim", url, 86400); // 24h CF cache
        if (!res.ok) {
            return c.json(createErrorBody({ code: "UPSTREAM_ERROR", message: "Geocoding service unavailable", status: 502 }), 502);
        }

        const payload = (await res.json()) as { address?: Record<string, string> };
        const address = payload.address;

        return c.json(
            {
                data: {
                    countryCode: address?.country_code?.toUpperCase() ?? null,
                    subdivisionCode: address?.["ISO3166-2-lvl4"]?.toUpperCase() ?? null,
                    subdivisionName: address?.state ?? address?.region ?? address?.county ?? null,
                } satisfies RegionInfo,
            },
            200,
            PRIVATE_NO_STORE,
        );
    })

    // ── GET /api/proxy/geocode/search ──
    // Forward geocoding for the manual city picker.
    .get("/geocode/search", apiValidator("query", geocodeSearchQuerySchema), async (c) => {
        const { name, locale } = c.req.valid("query");
        const language = getLanguage(locale).toLowerCase();
        const url = `${OPEN_METEO_GEOCODING_BASE}/v1/search?name=${encodeURIComponent(name)}&count=6&language=${encodeURIComponent(language)}&format=json`;

        const res = await upstreamFetch("open-meteo-geocoding", url, 86400); // 24h CF cache
        if (!res.ok) {
            return c.json(createErrorBody({ code: "UPSTREAM_ERROR", message: "Geocoding service unavailable", status: 502 }), 502);
        }

        const payload = (await res.json()) as {
            results?: Array<{ name: string; latitude: number; longitude: number; country?: string; country_code?: string; admin1?: string }>;
        };

        const results = (payload.results ?? []).map((result): CityResult => ({
            name: result.name,
            region: result.admin1 ?? null,
            country: result.country ?? null,
            countryCode: result.country_code?.toUpperCase() ?? null,
            latitude: roundCoordinate(result.latitude),
            longitude: roundCoordinate(result.longitude),
        }));

        return c.json({ data: results }, 200, PRIVATE_NO_STORE);
    })

    // ── GET /api/proxy/geo/approximate ──
    // City-level location from Cloudflare's edge geo for this request's IP. No
    // upstream call and no browser permission; fields are null when unknown.
    .get("/geo/approximate", (c) => {
        const cf = (c.req.raw as Request & { cf?: IncomingRequestCfProperties }).cf;
        const countryCode = parseEdgeCountry(cf?.country);
        const latitude = parseEdgeCoordinate(cf?.latitude, 90);
        const longitude = parseEdgeCoordinate(cf?.longitude, 180);
        const regionCode = cf?.regionCode?.toUpperCase();

        return c.json(
            {
                data: {
                    countryCode,
                    subdivisionCode: countryCode && regionCode ? `${countryCode}-${regionCode}` : null,
                    subdivisionName: cf?.region || null,
                    city: cf?.city || null,
                    coordinates: latitude !== null && longitude !== null ? { latitude, longitude } : null,
                } satisfies ApproximatePlace,
            },
            200,
            PRIVATE_NO_STORE,
        );
    })

    // ── GET /api/proxy/holidays/countries ──
    // Very long cache: country lists rarely change
    .get("/holidays/countries", apiValidator("query", holidayCountriesQuerySchema), async (c) => {
        const { locale } = c.req.valid("query");
        const language = getLanguage(locale);

        const [openRes, nagerRes] = await Promise.allSettled([
            upstreamFetch("open-holidays", `${OPEN_HOLIDAYS_BASE}/Countries?languageIsoCode=${encodeURIComponent(language)}`, 86400),
            upstreamFetch("nager", `${NAGER_BASE}/AvailableCountries`, 86400),
        ]);

        const merged = new Map<string, HolidayCountryOption>();

        if (nagerRes.status === "fulfilled" && nagerRes.value.ok) {
            const countries = (await nagerRes.value.json()) as Array<{ countryCode: string; name: string }>;
            for (const c of countries) {
                merged.set(c.countryCode, { code: c.countryCode, label: c.name });
            }
        }

        if (openRes.status === "fulfilled" && openRes.value.ok) {
            const countries = (await openRes.value.json()) as Array<{
                isoCode: string;
                name: Array<{ language: string; text: string }>;
            }>;
            for (const country of countries) {
                const label =
                    country.name.find((n) => n.language === language)?.text ??
                    country.name.find((n) => n.language === "EN")?.text ??
                    country.name[0]?.text ??
                    "";
                merged.set(country.isoCode, { code: country.isoCode, label });
            }
        }

        const sorted = [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
        return c.json({ data: sorted }, 200, cacheHeaders(86400)); // 24h client cache
    })

    // ── GET /api/proxy/holidays/subdivisions ──
    .get("/holidays/subdivisions", apiValidator("query", holidaySubdivisionsQuerySchema), async (c) => {
        const { countryCode, year, locale } = c.req.valid("query");
        const language = getLanguage(locale);
        const cc = countryCode.toUpperCase();

        let subdivisions: HolidaySubdivisionOption[] = [];

        try {
            const res = await upstreamFetch(
                "open-holidays",
                `${OPEN_HOLIDAYS_BASE}/Subdivisions?countryIsoCode=${encodeURIComponent(cc)}&languageIsoCode=${encodeURIComponent(language)}`,
                86400,
            );
            if (res.ok) {
                const raw = (await res.json()) as Array<{
                    code: string;
                    isoCode?: string;
                    name: Array<{ language: string; text: string }>;
                }>;
                subdivisions = raw
                    .map((s) => ({
                        code: s.code || s.isoCode || "",
                        label:
                            s.name.find((n) => n.language === language)?.text ??
                            s.name.find((n) => n.language === "EN")?.text ??
                            s.name[0]?.text ??
                            "",
                    }))
                    .filter((s) => s.code);
            }
        } catch {
            // Fall through to Nager
        }

        if (subdivisions.length === 0) {
            try {
                const res = await upstreamFetch("nager", `${NAGER_BASE}/PublicHolidays/${year}/${encodeURIComponent(cc)}`, 86400);
                if (res.ok) {
                    const holidays = (await res.json()) as Array<{
                        types: string[];
                        counties: string[] | null;
                    }>;
                    const codes = new Set<string>();
                    for (const h of holidays) {
                        if (!h.types.includes("Public")) continue;
                        for (const county of h.counties ?? []) codes.add(county);
                    }
                    subdivisions = [...codes].map((code) => ({ code, label: code }));
                }
            } catch {
                // Return empty
            }
        }

        const sorted = subdivisions.sort((a, b) => a.label.localeCompare(b.label));
        return c.json({ data: sorted }, 200, cacheHeaders(86400)); // 24h client cache
    })

    // ── GET /api/proxy/holidays ──
    .get("/holidays", apiValidator("query", holidaysQuerySchema), async (c) => {
        const { countryCode, start, end, subdivisionCode, locale } = c.req.valid("query");
        const language = getLanguage(locale);
        const cc = countryCode.toUpperCase();
        const subCode = subdivisionCode?.trim() || null;

        // Try OpenHolidays first
        try {
            let url = `${OPEN_HOLIDAYS_BASE}/PublicHolidays?countryIsoCode=${encodeURIComponent(cc)}&validFrom=${encodeURIComponent(start)}&validTo=${encodeURIComponent(end)}&languageIsoCode=${encodeURIComponent(language)}`;
            if (subCode) url += `&subdivisionCode=${encodeURIComponent(subCode)}`;

            const res = await upstreamFetch("open-holidays", url, 43200); // 12h CF cache
            if (res.ok) {
                const raw = (await res.json()) as Array<{
                    startDate: string;
                    name: Array<{ language: string; text: string }>;
                    nationwide?: boolean;
                    subdivisions?: Array<{ code: string }>;
                }>;

                const holidays = raw
                    .map((h): HolidayRecord | null => {
                        const scopes = h.subdivisions?.map((s) => s.code) ?? [];
                        const isRegional = h.nationwide === false || scopes.length > 0;

                        if (subCode) {
                            if (isRegional && !scopes.includes(subCode)) return null;
                        } else if (isRegional) {
                            return null;
                        }

                        const displayName =
                            h.name.find((n) => n.language === language)?.text ??
                            h.name.find((n) => n.language === "EN")?.text ??
                            h.name[0]?.text ??
                            "";
                        const englishName = h.name.find((n) => n.language === "EN")?.text ?? displayName;

                        return {
                            date: h.startDate,
                            name: englishName,
                            localName: displayName !== englishName ? displayName : undefined,
                            countryCode: cc,
                            subdivisionCode: subCode,
                            isRegional,
                        };
                    })
                    .filter((h) => h !== null);

                if (holidays.length > 0) {
                    return c.json({ data: holidays }, 200, cacheHeaders(43200)); // 12h client cache
                }
            }
        } catch {
            // Fall through to Nager
        }

        // Fallback to Nager
        const year = Number.parseInt(start.slice(0, 4), 10);
        const nagerRes = await upstreamFetch("nager", `${NAGER_BASE}/PublicHolidays/${year}/${encodeURIComponent(cc)}`, 43200);
        if (!nagerRes.ok) {
            return c.json({ data: [] }, 200, cacheHeaders(3600));
        }

        const nagerRaw = (await nagerRes.json()) as Array<{
            date: string;
            localName: string;
            name: string;
            countryCode: string;
            global: boolean;
            counties: string[] | null;
            types: string[];
        }>;

        const holidays = nagerRaw
            .filter((h) => h.types.includes("Public"))
            .map((h): HolidayRecord | null => {
                const scopes = h.counties ?? [];
                const isRegional = !h.global || scopes.length > 0;

                if (subCode) {
                    if (isRegional && !scopes.includes(subCode)) return null;
                } else if (isRegional) {
                    return null;
                }

                return {
                    date: h.date,
                    name: h.name,
                    localName: h.localName !== h.name ? h.localName : undefined,
                    countryCode: h.countryCode,
                    subdivisionCode: subCode,
                    isRegional,
                };
            })
            .filter((h): h is HolidayRecord => h !== null && h.date >= start && h.date <= end);

        return c.json({ data: holidays }, 200, cacheHeaders(43200));
    });
