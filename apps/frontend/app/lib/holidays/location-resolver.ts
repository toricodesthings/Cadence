export interface HolidaySubdivisionOption {
    code: string;
    label: string;
}

/** What a location source knows about the user's region, used to pick holiday subdivisions. */
export interface RegionHint {
    subdivisionCode?: string | null;
    subdivisionName?: string | null;
}

// IANA zone → country for the zones people actually run. A zone missing here
// yields null (the caller then tries the locale) rather than a wrong guess.
const TIMEZONE_COUNTRY_MAP: Record<string, string> = {
    // North America
    "America/Anchorage": "US",
    "America/Boise": "US",
    "America/Chicago": "US",
    "America/Denver": "US",
    "America/Detroit": "US",
    "America/Juneau": "US",
    "America/Los_Angeles": "US",
    "America/New_York": "US",
    "America/Phoenix": "US",
    "America/Puerto_Rico": "PR",
    "Pacific/Honolulu": "US",
    "America/Toronto": "CA",
    "America/Vancouver": "CA",
    "America/Edmonton": "CA",
    "America/Winnipeg": "CA",
    "America/Regina": "CA",
    "America/Halifax": "CA",
    "America/Moncton": "CA",
    "America/St_Johns": "CA",
    "America/Whitehorse": "CA",
    "America/Yellowknife": "CA",
    "America/Mexico_City": "MX",
    "America/Monterrey": "MX",
    "America/Tijuana": "MX",
    "America/Cancun": "MX",
    // Central & South America, Caribbean
    "America/Guatemala": "GT",
    "America/Costa_Rica": "CR",
    "America/Panama": "PA",
    "America/Havana": "CU",
    "America/Jamaica": "JM",
    "America/Bogota": "CO",
    "America/Lima": "PE",
    "America/Caracas": "VE",
    "America/Santiago": "CL",
    "America/Buenos_Aires": "AR",
    "America/Montevideo": "UY",
    "America/Sao_Paulo": "BR",
    "America/Bahia": "BR",
    "America/Manaus": "BR",
    // Europe
    "Europe/London": "GB",
    "Europe/Dublin": "IE",
    "Europe/Lisbon": "PT",
    "Europe/Madrid": "ES",
    "Europe/Paris": "FR",
    "Europe/Brussels": "BE",
    "Europe/Amsterdam": "NL",
    "Europe/Luxembourg": "LU",
    "Europe/Berlin": "DE",
    "Europe/Zurich": "CH",
    "Europe/Vienna": "AT",
    "Europe/Rome": "IT",
    "Europe/Malta": "MT",
    "Europe/Copenhagen": "DK",
    "Europe/Oslo": "NO",
    "Europe/Stockholm": "SE",
    "Europe/Helsinki": "FI",
    "Atlantic/Reykjavik": "IS",
    "Europe/Warsaw": "PL",
    "Europe/Prague": "CZ",
    "Europe/Bratislava": "SK",
    "Europe/Budapest": "HU",
    "Europe/Ljubljana": "SI",
    "Europe/Zagreb": "HR",
    "Europe/Belgrade": "RS",
    "Europe/Bucharest": "RO",
    "Europe/Sofia": "BG",
    "Europe/Athens": "GR",
    "Europe/Istanbul": "TR",
    "Europe/Kyiv": "UA",
    "Europe/Kiev": "UA",
    "Europe/Vilnius": "LT",
    "Europe/Riga": "LV",
    "Europe/Tallinn": "EE",
    "Europe/Moscow": "RU",
    // Africa & Middle East
    "Africa/Johannesburg": "ZA",
    "Africa/Lagos": "NG",
    "Africa/Nairobi": "KE",
    "Africa/Cairo": "EG",
    "Africa/Casablanca": "MA",
    "Asia/Dubai": "AE",
    "Asia/Riyadh": "SA",
    "Asia/Jerusalem": "IL",
    "Asia/Tel_Aviv": "IL",
    // Asia & Pacific
    "Asia/Karachi": "PK",
    "Asia/Kolkata": "IN",
    "Asia/Calcutta": "IN",
    "Asia/Dhaka": "BD",
    "Asia/Bangkok": "TH",
    "Asia/Ho_Chi_Minh": "VN",
    "Asia/Jakarta": "ID",
    "Asia/Kuala_Lumpur": "MY",
    "Asia/Singapore": "SG",
    "Asia/Manila": "PH",
    "Asia/Shanghai": "CN",
    "Asia/Hong_Kong": "HK",
    "Asia/Taipei": "TW",
    "Asia/Seoul": "KR",
    "Asia/Tokyo": "JP",
    "Pacific/Auckland": "NZ",
};

const TIMEZONE_PREFIX_COUNTRY: Array<[prefix: string, country: string]> = [
    ["US/", "US"],
    ["America/Indiana/", "US"],
    ["America/Kentucky/", "US"],
    ["America/North_Dakota/", "US"],
    ["America/Argentina/", "AR"],
    ["Canada/", "CA"],
    ["Australia/", "AU"],
];

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

    for (const [prefix, country] of TIMEZONE_PREFIX_COUNTRY) {
        if (timezone.startsWith(prefix)) return country;
    }

    return null;
}

/** Localized country name from the platform, no network needed ("CA" → "Canada"). */
export function getCountryLabel(countryCode: string | null | undefined, locale: string) {
    if (!countryCode) return null;
    try {
        return new Intl.DisplayNames([locale], { type: "region" }).of(countryCode) ?? countryCode;
    } catch {
        return countryCode;
    }
}

export function findSubdivisionCode(
    subdivisions: HolidaySubdivisionOption[],
    hint: RegionHint | null,
) {
    const code = hint?.subdivisionCode?.trim().toUpperCase();
    if (code && subdivisions.some((subdivision) => subdivision.code.toUpperCase() === code)) {
        return subdivisions.find((subdivision) => subdivision.code.toUpperCase() === code)!.code;
    }

    if (!hint?.subdivisionName) return null;

    const target = normalizeText(hint.subdivisionName);
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
