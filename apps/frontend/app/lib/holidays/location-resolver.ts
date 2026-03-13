export interface HolidaySubdivisionOption {
    code: string;
    label: string;
}

export interface PreciseHolidayLocation {
    countryCode: string | null;
    subdivisionName: string | null;
}

const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
    "America/Anchorage": "US",
    "America/Chicago": "US",
    "America/Denver": "US",
    "America/Detroit": "US",
    "America/Indiana/Indianapolis": "US",
    "America/Los_Angeles": "US",
    "America/New_York": "US",
    "America/Phoenix": "US",
    "America/Toronto": "CA",
    "America/Vancouver": "CA",
    "America/Edmonton": "CA",
    "America/Halifax": "CA",
    "America/St_Johns": "CA",
    "Europe/Berlin": "DE",
    "Europe/London": "GB",
    "Europe/Paris": "FR",
    "Europe/Rome": "IT",
    "Europe/Madrid": "ES",
    "Europe/Amsterdam": "NL",
    "Europe/Zurich": "CH",
    "Australia/Sydney": "AU",
    "Australia/Melbourne": "AU",
    "Australia/Brisbane": "AU",
    "Australia/Perth": "AU",
    "Pacific/Auckland": "NZ",
};

const SUBDIVISION_ALIASES: Record<string, string[]> = {
    "CA-BC": ["british columbia", "bc"],
    "CA-ON": ["ontario", "on"],
    "CA-QC": ["quebec", "québec", "qc"],
    "CA-AB": ["alberta", "ab"],
    "CA-MB": ["manitoba", "mb"],
    "CA-NS": ["nova scotia", "ns"],
    "CA-NB": ["new brunswick", "nb"],
    "CA-NL": ["newfoundland and labrador", "nl"],
    "CA-PE": ["prince edward island", "pe"],
    "CA-SK": ["saskatchewan", "sk"],
    "US-AL": ["alabama", "al"],
    "US-AK": ["alaska", "ak"],
    "US-AZ": ["arizona", "az"],
    "US-AR": ["arkansas", "ar"],
    "US-CA": ["california", "ca"],
    "US-CO": ["colorado", "co"],
    "US-CT": ["connecticut", "ct"],
    "US-DE": ["delaware", "de"],
    "US-FL": ["florida", "fl"],
    "US-GA": ["georgia", "ga"],
    "US-HI": ["hawaii", "hi"],
    "US-ID": ["idaho", "id"],
    "US-IL": ["illinois", "il"],
    "US-IN": ["indiana", "in"],
    "US-IA": ["iowa", "ia"],
    "US-KS": ["kansas", "ks"],
    "US-KY": ["kentucky", "ky"],
    "US-LA": ["louisiana", "la"],
    "US-ME": ["maine", "me"],
    "US-MD": ["maryland", "md"],
    "US-MA": ["massachusetts", "ma"],
    "US-MI": ["michigan", "mi"],
    "US-MN": ["minnesota", "mn"],
    "US-MS": ["mississippi", "ms"],
    "US-MO": ["missouri", "mo"],
    "US-MT": ["montana", "mt"],
    "US-NE": ["nebraska", "ne"],
    "US-NV": ["nevada", "nv"],
    "US-NH": ["new hampshire", "nh"],
    "US-NJ": ["new jersey", "nj"],
    "US-NM": ["new mexico", "nm"],
    "US-NY": ["new york", "ny"],
    "US-NC": ["north carolina", "nc"],
    "US-ND": ["north dakota", "nd"],
    "US-OH": ["ohio", "oh"],
    "US-OK": ["oklahoma", "ok"],
    "US-OR": ["oregon", "or"],
    "US-PA": ["pennsylvania", "pa"],
    "US-RI": ["rhode island", "ri"],
    "US-SC": ["south carolina", "sc"],
    "US-SD": ["south dakota", "sd"],
    "US-TN": ["tennessee", "tn"],
    "US-TX": ["texas", "tx"],
    "US-UT": ["utah", "ut"],
    "US-VT": ["vermont", "vt"],
    "US-VA": ["virginia", "va"],
    "US-WA": ["washington", "wa"],
    "US-WV": ["west virginia", "wv"],
    "US-WI": ["wisconsin", "wi"],
    "US-WY": ["wyoming", "wy"],
    "US-DC": ["district of columbia", "washington dc", "dc"],
};

function normalizeText(value: string | null | undefined) {
    return (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, " ")
        .trim()
        .toLowerCase();
}

export function normalizeCountryCode(value: string | null | undefined) {
    if (!value) return null;
    return value.trim().toUpperCase();
}

export function getPreferredLocale() {
    if (typeof navigator === "undefined") return "en-US";
    return navigator.languages?.[0] ?? navigator.language ?? "en-US";
}

export function getLocaleLanguage(locale: string | null | undefined) {
    if (!locale) return "EN";
    const normalized = locale.replace("_", "-");
    const [language] = normalized.split("-");
    return (language || "en").toUpperCase();
}

export function getLocaleRegion(locale: string | null | undefined) {
    if (!locale) return null;

    try {
        const parsed = new Intl.Locale(locale);
        return normalizeCountryCode(parsed.region);
    } catch {
        const parts = locale.replace("_", "-").split("-");
        const maybeRegion = parts.find((part, index) => index > 0 && /^[A-Za-z]{2}$/.test(part));
        return normalizeCountryCode(maybeRegion ?? null);
    }
}

export function inferCountryFromTimezone(timezone: string | null | undefined) {
    if (!timezone) return null;
    if (TIMEZONE_COUNTRY_MAP[timezone]) return TIMEZONE_COUNTRY_MAP[timezone];

    if (timezone.startsWith("US/")) return "US";
    if (timezone.startsWith("Canada/")) return "CA";
    if (timezone.startsWith("Australia/")) return "AU";
    if (timezone.startsWith("Europe/")) return null;
    if (timezone.startsWith("America/")) return "US";

    return null;
}

export function findSubdivisionCode(
    subdivisions: HolidaySubdivisionOption[],
    preciseLocation: PreciseHolidayLocation | null,
) {
    if (!preciseLocation?.subdivisionName) return null;

    const target = normalizeText(preciseLocation.subdivisionName);
    if (!target) return null;

    for (const subdivision of subdivisions) {
        const candidates = new Set<string>([
            normalizeText(subdivision.code),
            normalizeText(subdivision.label),
        ]);

        for (const alias of SUBDIVISION_ALIASES[subdivision.code] ?? []) {
            candidates.add(normalizeText(alias));
        }

        if (candidates.has(target)) {
            return subdivision.code;
        }
    }

    return null;
}
