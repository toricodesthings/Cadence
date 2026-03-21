import {
    normalizeCountryCode,
    type HolidaySubdivisionOption,
} from "./location-resolver";
import { authenticatedFetch } from "../api/client";
import { API_BASE_URL } from "../env";

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

function sortOptions<T extends { label: string }>(options: T[]) {
    return [...options].sort((left, right) => left.label.localeCompare(right.label));
}

async function proxyFetch<T>(path: string): Promise<T> {
    const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/proxy${path}`, {
        authenticated: true,
    });

    if (!response.ok) {
        throw new Error(`Proxy request failed with status ${response.status}`);
    }

    const body = (await response.json()) as { data: T };
    return body.data;
}

export async function fetchHolidayCountries(locale: string) {
    return proxyFetch<HolidayCountryOption[]>(`/holidays/countries?locale=${encodeURIComponent(locale)}`);
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
        const subdivisions = await proxyFetch<HolidaySubdivisionOption[]>(
            `/holidays/subdivisions?countryCode=${encodeURIComponent(normalizedCountryCode)}&year=${year}&locale=${encodeURIComponent(locale)}`,
        );
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

    const params = new URLSearchParams({
        countryCode: normalizedCountryCode,
        start,
        end,
        locale,
    });
    if (subdivisionCode?.trim()) {
        params.set("subdivisionCode", subdivisionCode.trim());
    }

    return proxyFetch<HolidayRecord[]>(`/holidays?${params.toString()}`);
}
