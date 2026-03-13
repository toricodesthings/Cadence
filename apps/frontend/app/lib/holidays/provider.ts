import {
    getLocaleLanguage,
    normalizeCountryCode,
    type HolidaySubdivisionOption,
} from "./location-resolver";

export interface HolidayCountryOption {
    code: string;
    label: string;
}

export interface HolidayRecord {
    date: string;
    name: string;
    localName?: string;
    countryCode: string;
    subdivisionCode?: string | null;
    isRegional: boolean;
}

interface OpenHolidayTranslation {
    language: string;
    text: string;
}

interface OpenHolidayCountryResponse {
    isoCode: string;
    name: OpenHolidayTranslation[];
}

interface OpenHolidaySubdivisionResponse {
    code: string;
    isoCode?: string;
    name: OpenHolidayTranslation[];
}

interface OpenHolidayResponse {
    startDate: string;
    name: OpenHolidayTranslation[];
    nationwide?: boolean;
    subdivisions?: Array<{ code: string }>;
}

interface NagerCountryResponse {
    countryCode: string;
    name: string;
}

interface NagerHolidayResponse {
    date: string;
    localName: string;
    name: string;
    countryCode: string;
    global: boolean;
    counties: string[] | null;
    types: string[];
}

const OPEN_HOLIDAYS_BASE_URL = "https://openholidaysapi.org";
const NAGER_BASE_URL = "https://date.nager.at/api/v3";

const SUBDIVISION_LABELS: Record<string, string> = {
    "CA-AB": "Alberta",
    "CA-BC": "British Columbia",
    "CA-MB": "Manitoba",
    "CA-NB": "New Brunswick",
    "CA-NL": "Newfoundland and Labrador",
    "CA-NS": "Nova Scotia",
    "CA-ON": "Ontario",
    "CA-PE": "Prince Edward Island",
    "CA-QC": "Quebec",
    "CA-SK": "Saskatchewan",
    "US-AL": "Alabama",
    "US-AK": "Alaska",
    "US-AZ": "Arizona",
    "US-AR": "Arkansas",
    "US-CA": "California",
    "US-CO": "Colorado",
    "US-CT": "Connecticut",
    "US-DE": "Delaware",
    "US-FL": "Florida",
    "US-GA": "Georgia",
    "US-HI": "Hawaii",
    "US-ID": "Idaho",
    "US-IL": "Illinois",
    "US-IN": "Indiana",
    "US-IA": "Iowa",
    "US-KS": "Kansas",
    "US-KY": "Kentucky",
    "US-LA": "Louisiana",
    "US-ME": "Maine",
    "US-MD": "Maryland",
    "US-MA": "Massachusetts",
    "US-MI": "Michigan",
    "US-MN": "Minnesota",
    "US-MS": "Mississippi",
    "US-MO": "Missouri",
    "US-MT": "Montana",
    "US-NE": "Nebraska",
    "US-NV": "Nevada",
    "US-NH": "New Hampshire",
    "US-NJ": "New Jersey",
    "US-NM": "New Mexico",
    "US-NY": "New York",
    "US-NC": "North Carolina",
    "US-ND": "North Dakota",
    "US-OH": "Ohio",
    "US-OK": "Oklahoma",
    "US-OR": "Oregon",
    "US-PA": "Pennsylvania",
    "US-RI": "Rhode Island",
    "US-SC": "South Carolina",
    "US-SD": "South Dakota",
    "US-TN": "Tennessee",
    "US-TX": "Texas",
    "US-UT": "Utah",
    "US-VT": "Vermont",
    "US-VA": "Virginia",
    "US-WA": "Washington",
    "US-WV": "West Virginia",
    "US-WI": "Wisconsin",
    "US-WY": "Wyoming",
    "US-DC": "District of Columbia",
};

function getStaticSubdivisions(countryCode: string) {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    if (!normalizedCountryCode) return [];

    return Object.entries(SUBDIVISION_LABELS)
        .filter(([code]) => code.startsWith(`${normalizedCountryCode}-`))
        .map(([code, label]) => ({ code, label }));
}

function mergeSubdivisionOptions(...groups: HolidaySubdivisionOption[][]) {
    const merged = new Map<string, HolidaySubdivisionOption>();

    for (const group of groups) {
        for (const subdivision of group) {
            merged.set(subdivision.code, subdivision);
        }
    }

    return sortOptions([...merged.values()]);
}

async function fetchJson<T>(url: string) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
}

function pickLocalizedText(translations: OpenHolidayTranslation[], locale: string) {
    const language = getLocaleLanguage(locale);
    return (
        translations.find((entry) => entry.language === language)?.text ??
        translations.find((entry) => entry.language === "EN")?.text ??
        translations[0]?.text ??
        ""
    );
}

function sortOptions<T extends { label: string }>(options: T[]) {
    return [...options].sort((left, right) => left.label.localeCompare(right.label));
}

async function fetchOpenHolidayCountries(locale: string) {
    const language = getLocaleLanguage(locale);
    const countries = await fetchJson<OpenHolidayCountryResponse[]>(
        `${OPEN_HOLIDAYS_BASE_URL}/Countries?languageIsoCode=${language}`,
    );

    return countries.map((country) => ({
        code: country.isoCode,
        label: pickLocalizedText(country.name, locale),
    }));
}

async function fetchNagerCountries() {
    const countries = await fetchJson<NagerCountryResponse[]>(
        `${NAGER_BASE_URL}/AvailableCountries`,
    );

    return countries.map((country) => ({
        code: country.countryCode,
        label: country.name,
    }));
}

async function fetchOpenHolidaySubdivisions(countryCode: string, locale: string) {
    const language = getLocaleLanguage(locale);
    const subdivisions = await fetchJson<OpenHolidaySubdivisionResponse[]>(
        `${OPEN_HOLIDAYS_BASE_URL}/Subdivisions?countryIsoCode=${countryCode}&languageIsoCode=${language}`,
    );

    return subdivisions.map((subdivision) => ({
        code: subdivision.code || subdivision.isoCode || "",
        label: pickLocalizedText(subdivision.name, locale),
    })).filter((subdivision) => subdivision.code);
}

async function fetchNagerDerivedSubdivisions(countryCode: string, year: number) {
    const holidays = await fetchJson<NagerHolidayResponse[]>(
        `${NAGER_BASE_URL}/PublicHolidays/${year}/${countryCode}`,
    );

    const codes = new Set<string>();
    for (const holiday of holidays) {
        if (!holiday.types.includes("Public")) continue;
        for (const county of holiday.counties ?? []) {
            codes.add(county);
        }
    }

    return [...codes].map((code) => ({
        code,
        label: SUBDIVISION_LABELS[code] ?? code,
    }));
}

function normalizeOpenHoliday(
    holiday: OpenHolidayResponse,
    locale: string,
    countryCode: string,
    subdivisionCode: string | null,
): HolidayRecord | null {
    const scopes = holiday.subdivisions?.map((entry) => entry.code) ?? [];
    const isRegional = holiday.nationwide === false || scopes.length > 0;

    if (subdivisionCode) {
        if (isRegional && !scopes.includes(subdivisionCode)) {
            return null;
        }
    } else if (isRegional) {
        return null;
    }

    const displayName = pickLocalizedText(holiday.name, locale);
    const englishName = holiday.name.find((entry) => entry.language === "EN")?.text ?? displayName;

    return {
        date: holiday.startDate,
        name: englishName,
        localName: displayName !== englishName ? displayName : undefined,
        countryCode,
        subdivisionCode: subdivisionCode,
        isRegional,
    };
}

function normalizeNagerHoliday(
    holiday: NagerHolidayResponse,
    subdivisionCode: string | null,
): HolidayRecord | null {
    if (!holiday.types.includes("Public")) return null;

    const scopes = holiday.counties ?? [];
    const isRegional = !holiday.global || scopes.length > 0;

    if (subdivisionCode) {
        if (isRegional && !scopes.includes(subdivisionCode)) {
            return null;
        }
    } else if (isRegional) {
        return null;
    }

    return {
        date: holiday.date,
        name: holiday.name,
        localName: holiday.localName !== holiday.name ? holiday.localName : undefined,
        countryCode: holiday.countryCode,
        subdivisionCode,
        isRegional,
    };
}

export async function fetchHolidayCountries(locale: string) {
    const [openResult, nagerResult] = await Promise.allSettled([
        fetchOpenHolidayCountries(locale),
        fetchNagerCountries(),
    ]);

    const merged = new Map<string, HolidayCountryOption>();

    if (nagerResult.status === "fulfilled") {
        for (const country of nagerResult.value) {
            merged.set(country.code, country);
        }
    }

    if (openResult.status === "fulfilled") {
        for (const country of openResult.value) {
            merged.set(country.code, country);
        }
    }

    return sortOptions([...merged.values()]);
}

export async function fetchHolidaySubdivisions(
    countryCode: string,
    year: number,
    locale: string,
): Promise<HolidaySubdivisionOption[]> {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    if (!normalizedCountryCode) return [];
    const staticSubdivisions = getStaticSubdivisions(normalizedCountryCode);

    try {
        const subdivisions = await fetchOpenHolidaySubdivisions(normalizedCountryCode, locale);
        if (subdivisions.length > 0 || staticSubdivisions.length > 0) {
            return mergeSubdivisionOptions(staticSubdivisions, subdivisions);
        }
    } catch {
        // Fall through to Nager-derived subdivision discovery.
    }

    try {
        const subdivisions = await fetchNagerDerivedSubdivisions(normalizedCountryCode, year);
        return mergeSubdivisionOptions(staticSubdivisions, subdivisions);
    } catch {
        return staticSubdivisions;
    }
}

export async function fetchHolidays({
    start,
    end,
    countryCode,
    subdivisionCode,
    locale,
}: {
    start: string;
    end: string;
    countryCode: string;
    subdivisionCode: string | null;
    locale: string;
}) {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    if (!normalizedCountryCode) return [];

    const normalizedSubdivisionCode = subdivisionCode?.trim() || null;
    const language = getLocaleLanguage(locale);

    try {
        const openHolidays = await fetchJson<OpenHolidayResponse[]>(
            `${OPEN_HOLIDAYS_BASE_URL}/PublicHolidays?countryIsoCode=${normalizedCountryCode}&validFrom=${start}&validTo=${end}&languageIsoCode=${language}${normalizedSubdivisionCode ? `&subdivisionCode=${normalizedSubdivisionCode}` : ""}`,
        );

        const normalized = openHolidays
            .map((holiday) => normalizeOpenHoliday(holiday, locale, normalizedCountryCode, normalizedSubdivisionCode))
            .filter((holiday): holiday is HolidayRecord => Boolean(holiday));

        if (normalized.length > 0) {
            return normalized;
        }
    } catch {
        // Fallback to Nager when OpenHolidays is unavailable or unsupported for this country.
    }

    const year = Number.parseInt(start.slice(0, 4), 10);
    const nagerHolidays = await fetchJson<NagerHolidayResponse[]>(
        `${NAGER_BASE_URL}/PublicHolidays/${year}/${normalizedCountryCode}`,
    );

    return nagerHolidays
        .map((holiday) => normalizeNagerHoliday(holiday, normalizedSubdivisionCode))
        .filter((holiday): holiday is HolidayRecord => {
            return holiday !== null && holiday.date >= start && holiday.date <= end;
        });
}
