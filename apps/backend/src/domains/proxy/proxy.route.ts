import { Hono } from "hono";
import type { Env } from "../../types/env";
import type { AuthVariables } from "../../platform/auth";
import { apiValidator } from "../../platform/validation";
import { createErrorBody } from "../../platform/errors";
import {
    weatherQuerySchema,
    reverseGeocodeQuerySchema,
    holidayCountriesQuerySchema,
    holidaySubdivisionsQuerySchema,
    holidaysQuerySchema,
} from "./proxy.schema";

export const proxyRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// ── Helpers ──

const OPEN_METEO_BASE = "https://api.open-meteo.com";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OPEN_HOLIDAYS_BASE = "https://openholidaysapi.org";
const NAGER_BASE = "https://date.nager.at/api/v3";

const MAX_UPSTREAM_BODY = 1_048_576; // 1MB
const ALLOWED_CONTENT_TYPES = ["application/json", "text/plain"];

async function upstreamFetch(url: string, cacheTtl: number): Promise<Response> {
    const res = await fetch(url, {
        headers: { "User-Agent": "Cadence/1.0 (cadenceapp.cloud)" },
        cf: { cacheTtl, cacheEverything: true },
    });

    // Validate upstream response content-type
    const ct = res.headers.get("content-type") || "";
    if (!ALLOWED_CONTENT_TYPES.some((t) => ct.includes(t))) {
        return new Response(JSON.stringify({ error: { code: "UPSTREAM_ERROR", message: "Unexpected content type from upstream" } }), { status: 502 });
    }

    // Reject oversized upstream responses
    const cl = res.headers.get("content-length");
    if (cl && parseInt(cl, 10) > MAX_UPSTREAM_BODY) {
        return new Response(JSON.stringify({ error: { code: "UPSTREAM_ERROR", message: "Upstream response too large" } }), { status: 502 });
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
function privateCacheHeaders(maxAge: number): Record<string, string> {
    return {
        "Cache-Control": `private, no-store, max-age=0`,
    };
}

function getLanguage(locale: string): string {
    return locale.split("-")[0]?.toUpperCase() || "EN";
}

// ── GET /api/proxy/weather ──
// Short cache: weather changes frequently
proxyRoutes.get("/weather", apiValidator("query", weatherQuerySchema), async (c) => {
    const { latitude, longitude } = c.req.valid("query");
    const url = `${OPEN_METEO_BASE}/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&temperature_unit=celsius`;

    const res = await upstreamFetch(url, 900); // 15 min CF cache
    if (!res.ok) {
        return c.json(createErrorBody({ code: "UPSTREAM_ERROR", message: "Weather service unavailable", status: 502 }), 502);
    }

    const data = await res.json();
    return c.json({ data }, 200, privateCacheHeaders(0)); // user-sensitive coordinates
});

// ── GET /api/proxy/geocode/reverse ──
// Long cache: a lat/lon mapping rarely changes
proxyRoutes.get("/geocode/reverse", apiValidator("query", reverseGeocodeQuerySchema), async (c) => {
    const { latitude, longitude } = c.req.valid("query");
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=5&addressdetails=1`;

    const res = await upstreamFetch(url, 86400); // 24h CF cache
    if (!res.ok) {
        return c.json(createErrorBody({ code: "UPSTREAM_ERROR", message: "Geocoding service unavailable", status: 502 }), 502);
    }

    const payload = (await res.json()) as { address?: Record<string, string> };
    const address = payload.address;

    return c.json(
        {
            data: {
                countryCode: address?.country_code?.toUpperCase() ?? null,
                subdivisionName: address?.state ?? address?.region ?? address?.county ?? null,
            },
        },
        200,
        privateCacheHeaders(0), // user-sensitive coordinates
    );
});

// ── GET /api/proxy/holidays/countries ──
// Very long cache: country lists rarely change
proxyRoutes.get("/holidays/countries", apiValidator("query", holidayCountriesQuerySchema), async (c) => {
    const { locale } = c.req.valid("query");
    const language = getLanguage(locale);

    const [openRes, nagerRes] = await Promise.allSettled([
        upstreamFetch(`${OPEN_HOLIDAYS_BASE}/Countries?languageIsoCode=${language}`, 86400),
        upstreamFetch(`${NAGER_BASE}/AvailableCountries`, 86400),
    ]);

    const merged = new Map<string, { code: string; label: string }>();

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
});

// ── GET /api/proxy/holidays/subdivisions ──
proxyRoutes.get("/holidays/subdivisions", apiValidator("query", holidaySubdivisionsQuerySchema), async (c) => {
    const { countryCode, year, locale } = c.req.valid("query");
    const language = getLanguage(locale);
    const cc = countryCode.toUpperCase();

    let subdivisions: Array<{ code: string; label: string }> = [];

    try {
        const res = await upstreamFetch(
            `${OPEN_HOLIDAYS_BASE}/Subdivisions?countryIsoCode=${cc}&languageIsoCode=${language}`,
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
            const res = await upstreamFetch(`${NAGER_BASE}/PublicHolidays/${year}/${cc}`, 86400);
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
});

// ── GET /api/proxy/holidays ──
proxyRoutes.get("/holidays", apiValidator("query", holidaysQuerySchema), async (c) => {
    const { countryCode, start, end, subdivisionCode, locale } = c.req.valid("query");
    const language = getLanguage(locale);
    const cc = countryCode.toUpperCase();
    const subCode = subdivisionCode?.trim() || null;

    // Try OpenHolidays first
    try {
        let url = `${OPEN_HOLIDAYS_BASE}/PublicHolidays?countryIsoCode=${cc}&validFrom=${start}&validTo=${end}&languageIsoCode=${language}`;
        if (subCode) url += `&subdivisionCode=${subCode}`;

        const res = await upstreamFetch(url, 43200); // 12h CF cache
        if (res.ok) {
            const raw = (await res.json()) as Array<{
                startDate: string;
                name: Array<{ language: string; text: string }>;
                nationwide?: boolean;
                subdivisions?: Array<{ code: string }>;
            }>;

            const holidays = raw
                .map((h) => {
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
                .filter(Boolean);

            if (holidays.length > 0) {
                return c.json({ data: holidays }, 200, cacheHeaders(43200)); // 12h client cache
            }
        }
    } catch {
        // Fall through to Nager
    }

    // Fallback to Nager
    const year = Number.parseInt(start.slice(0, 4), 10);
    const nagerRes = await upstreamFetch(`${NAGER_BASE}/PublicHolidays/${year}/${cc}`, 43200);
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
        .map((h) => {
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
        .filter((h) => h !== null && h.date >= start && h.date <= end);

    return c.json({ data: holidays }, 200, cacheHeaders(43200));
});
