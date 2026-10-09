import { useMemo, useState, type FormEvent } from "react";
import { formatShortDateTime } from "../../../lib/utils/date-format";
import { useToday } from "../../../lib/utils/user-zone";
import { ExternalLink } from "../../shared/ExternalLink";
import { CADENCE_PRIVACY_URL } from "../../../lib/constants/app-info";
import { useQuery } from "@tanstack/react-query";
import { Compass, EyeOff, LocateFixed, MapPin, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { CityResult } from "@cadence/contracts/proxy";
import type { LocationMode } from "@cadence/contracts/settings";
import { Button, Switch } from "../../primitives";
import { SearchSelect } from "../../primitives/SearchSelect";
import { SearchField } from "../../primitives/SearchField";
import { SettingsList, SettingsRow, SettingsSection } from "../layout/SettingsLayout";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { useUserLocation, type LocationSource, type ResolvedPlace } from "../../../hooks/environment/use-user-location";
import { HOLIDAY_SOURCE_LABELS, useHolidayOverlay } from "../../../hooks/environment/use-holiday-overlay";
import { fetchHolidayCountries, fetchHolidaySubdivisions } from "../../../lib/holidays/provider";
import { getCountryLabel, getPreferredLocale } from "../../../lib/holidays/location-resolver";
import { unwrapResponse } from "../../../lib/api/helpers";
import { queryKeys } from "../../../lib/api/query-keys";
import { IS_DESKTOP_RUNTIME } from "../../../platform/runtime";
import { cn } from "../../../lib/utils";

type UserLocation = ReturnType<typeof useUserLocation>;

const DAY_MS = 24 * 60 * 60 * 1000;

const MODE_OPTIONS: Array<{ mode: LocationMode; label: string; description: string; icon: LucideIcon }> = [
    {
        mode: "approximate",
        label: "Approximate",
        description: "From your network. No prompt.",
        icon: Compass,
    },
    {
        mode: "precise",
        label: "Precise",
        description: "From your device. Asks once.",
        icon: LocateFixed,
    },
    {
        mode: "manual",
        label: "Choose myself",
        description: "Pick country, region and city.",
        icon: SlidersHorizontal,
    },
    {
        mode: "off",
        label: "Off",
        description: "No weather. Holidays follow your time zone.",
        icon: EyeOff,
    },
];

const SOURCE_LABELS: Record<LocationSource, string> = {
    precise: "Precise",
    approximate: "Approximate",
    manual: "Chosen by you",
};

function formatPlace(place: ResolvedPlace, locale: string, subdivisionFallback: string | null) {
    const parts = [place.city, place.subdivisionName ?? subdivisionFallback, getCountryLabel(place.countryCode, locale)];
    return parts.filter(Boolean).join(", ") || "Unknown area";
}

function formatUpdatedAt(iso: string) {
    return formatShortDateTime(iso);
}

export function LocationTab() {
    const location = useUserLocation();
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const locale = getPreferredLocale();
    const year = Number(useToday().slice(0, 4));
    const holidays = useHolidayOverlay({
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        viewMode: "year",
        fetchOverlay: false,
    });
    const weatherEnabled = settings?.weather?.enabled ?? true;

    const holidayNote = holidays.regionLabel && holidays.source
        ? `${holidays.regionLabel} · ${HOLIDAY_SOURCE_LABELS[holidays.source]}`
        : undefined;

    const handleForget = () => {
        location.forgetLocation();
    };

    return (
        <div className="flex flex-col gap-10">
            <h2 className="mb-2 text-2xl font-bold text-twilight-text">Location & Weather</h2>

            <SettingsSection title="How Cadence finds you">
                <ModePicker location={location} />
                <LocationCard location={location} locale={locale} subdivisionFallback={holidays.subdivisionLabel} year={year} />
            </SettingsSection>

            <SettingsSection title="Used for">
                <SettingsList>
                    <SettingsRow inline title="Weather" description={location.mode === "off" ? "Hidden while location is off" : undefined}>
                        <Switch
                            checked={weatherEnabled}
                            onCheckedChange={(enabled) => updateSettings.mutate({ weather: { enabled } })}
                            aria-label="Show weather"
                        />
                    </SettingsRow>
                    <SettingsRow inline title="Holidays" description={holidayNote}>
                        <Switch
                            checked={holidays.enabled}
                            onCheckedChange={holidays.setEnabled}
                            aria-label="Show holidays"
                        />
                    </SettingsRow>
                </SettingsList>
            </SettingsSection>

            <SettingsSection title="Privacy">
                <SettingsList>
                    <SettingsRow inline title="Rounded to about 1 km" description="Weather comes from Open-Meteo. A precise position is named through OpenStreetMap.">
                        <ExternalLink href={CADENCE_PRIVACY_URL} className="whitespace-nowrap text-sm text-accent-primary hover:underline">
                            Privacy policy
                        </ExternalLink>
                    </SettingsRow>
                    <SettingsRow inline title="Saved on this device" description="A precise position is kept up to 7 days, and cleared at sign-out.">
                        <Button type="button" variant="secondary" size="sm" aria-label="Forget saved location" onClick={handleForget}>
                            Forget
                        </Button>
                    </SettingsRow>
                </SettingsList>
            </SettingsSection>
        </div>
    );
}

function ModePicker({ location }: { location: UserLocation }) {
    return (
        <div role="radiogroup" aria-label="Location mode" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {MODE_OPTIONS.map(({ mode, label, description, icon: Icon }) => {
                const selected = location.mode === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={!location.ready}
                        onClick={() => {
                            if (!selected) void location.setMode(mode);
                        }}
                        className={cn(
                            "flex min-h-11 cursor-pointer flex-col gap-1.5 rounded-[1.4rem] border p-4 text-left transition-colors disabled:cursor-wait disabled:opacity-60",
                            selected
                                ? "border-accent-primary/30 bg-accent-primary/10"
                                : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]",
                        )}
                    >
                        <span className={cn("inline-flex items-center gap-2 text-sm font-medium", selected ? "text-accent-primary" : "text-twilight-text")}>
                            <Icon size={15} aria-hidden="true" />
                            {label}
                        </span>
                        <span className="text-xs text-twilight-text-soft">{description}</span>
                    </button>
                );
            })}
        </div>
    );
}

/** Where Cadence thinks you are, and (when you choose yourself) the fields to change it, in one card. */
function LocationCard({
    location,
    locale,
    subdivisionFallback,
    year,
}: {
    location: UserLocation;
    locale: string;
    subdivisionFallback: string | null;
    year: number;
}) {
    const { place } = location;
    const label = location.mode === "off"
        ? "Location is off"
        : place
            ? formatPlace(place, locale, subdivisionFallback)
            : location.isResolving ? "Finding your area..." : "Not set yet";

    return (
        <div className="flex flex-col divide-y divide-white/[0.04] rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02]">
            <div className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-twilight-text">
                    <MapPin size={14} aria-hidden="true" className="text-twilight-text-soft" />
                    <span className="font-medium">{label}</span>
                    {place ? (
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-xs text-twilight-text-soft">
                            {SOURCE_LABELS[place.source]}
                        </span>
                    ) : null}
                    {location.refreshedAt ? (
                        <span className="text-xs text-twilight-text-muted">Updated {formatUpdatedAt(location.refreshedAt)}</span>
                    ) : null}
                </div>
                <PreciseStatus location={location} />
            </div>
            {location.mode === "manual" ? <ManualLocationEditor location={location} locale={locale} year={year} /> : null}
        </div>
    );
}

/** Explains why precise mode is (or isn't) working, and offers the one action that helps. */
function PreciseStatus({ location }: { location: UserLocation }) {
    if (location.mode !== "precise") return null;
    const { permissionState, isLocating, preciseFailed, place } = location;

    let message: string | null = null;
    let action: string | null = null;

    if (isLocating) {
        message = "Finding your position...";
    } else if (permissionState === "unsupported") {
        message = "This browser can't share a precise position, so Cadence is using your approximate location.";
    } else if (permissionState === "denied") {
        message = IS_DESKTOP_RUNTIME
            ? "Location access is blocked for Cadence on this computer, so Cadence is using your approximate location."
            : "Your browser blocks location for Cadence, so Cadence is using your approximate location. To allow it, open the site settings from the icon next to the address bar.";
    } else if (permissionState === "prompt" && !place) {
        message = "Precise location isn't allowed on this device yet. Until it is, Cadence uses your approximate location.";
        action = "Allow on this device";
    } else if (preciseFailed && !place) {
        message = "Your device couldn't find its position just now, so Cadence is using your approximate location.";
        action = "Try again";
    }

    if (!message) return null;

    return (
        <div className="mt-3 flex flex-col gap-2 text-xs leading-relaxed text-twilight-text-soft sm:flex-row sm:items-center sm:justify-between">
            <p>{message}</p>
            {action ? (
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => void location.requestPrecise()}
                >
                    <LocateFixed size={13} aria-hidden="true" />
                    {action}
                </Button>
            ) : null}
        </div>
    );
}

const NONE = "__none__";
const FIELD_LABEL = "mb-1.5 text-xs font-medium text-twilight-text-soft";

function ManualLocationEditor({ location, locale, year }: { location: UserLocation; locale: string; year: number }) {
    const client = useApiClient();
    const countryCode = location.manualCountryCode;
    const [draft, setDraft] = useState("");
    const [search, setSearch] = useState<string | null>(null);
    const [changing, setChanging] = useState(false);

    const countriesQuery = useQuery({
        queryKey: ["holiday-country-options", locale],
        queryFn: () => fetchHolidayCountries(locale),
        staleTime: DAY_MS,
        gcTime: 14 * DAY_MS,
    });

    const subdivisionsQuery = useQuery({
        queryKey: ["holiday-subdivisions", countryCode, year, locale],
        queryFn: () => fetchHolidaySubdivisions(countryCode!, year, locale),
        enabled: Boolean(countryCode),
        staleTime: DAY_MS,
        gcTime: 14 * DAY_MS,
    });

    const citiesQuery = useQuery({
        queryKey: [...queryKeys.location.all, "city-search", search, locale],
        queryFn: async () => unwrapResponse(
            await client.api.proxy.geocode.search.$get({ query: { name: search!, locale } }),
        ),
        enabled: search !== null,
        staleTime: 60 * 60 * 1000,
        meta: { persist: false },
    });

    const countries = useMemo(() => (countriesQuery.data ?? []).map(({ code, label }) => ({ value: code, label })), [countriesQuery.data]);
    const regions = useMemo(() => (subdivisionsQuery.data ?? []).map(({ code, label }) => ({ value: code, label })), [subdivisionsQuery.data]);
    const noCountry = useMemo(() => [{ value: NONE, label: "Use my time zone" }], []);
    const noRegion = useMemo(() => [{ value: NONE, label: "Country-wide holidays only" }], []);

    const submitSearch = (event: FormEvent) => {
        event.preventDefault();
        const name = draft.trim();
        if (name.length >= 2) setSearch(name);
    };

    const chooseCity = async (city: CityResult) => {
        const sameCountry = !city.countryCode || city.countryCode === countryCode;
        const saved = await location.setManualLocation({
            city: { name: city.name, latitude: city.latitude, longitude: city.longitude },
            countryCode: city.countryCode ?? countryCode,
            subdivisionCode: sameCountry ? location.manualSubdivisionCode : null,
        });
        if (saved) {
            setSearch(null);
            setDraft("");
            setChanging(false);
        }
    };

    return (
        <div className="grid gap-4 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <p className={FIELD_LABEL}>Country</p>
                    <SearchSelect
                        value={countryCode ?? NONE}
                        onValueChange={(value) => void location.setManualLocation({
                            countryCode: value === NONE ? null : value,
                            subdivisionCode: null,
                        })}
                        options={countries}
                        pinned={noCountry}
                        ariaLabel="Country"
                        searchLabel="Search countries"
                        placeholder={countriesQuery.isLoading ? "Loading countries..." : "Choose a country"}
                    />
                </div>

                <div>
                    <p className={FIELD_LABEL}>Region / State</p>
                    <SearchSelect
                        value={location.manualSubdivisionCode ?? NONE}
                        onValueChange={(value) => void location.setManualLocation({ subdivisionCode: value === NONE ? null : value })}
                        options={regions}
                        pinned={noRegion}
                        ariaLabel="Region or state"
                        searchLabel="Search regions"
                        placeholder={!countryCode ? "Choose a country first" : subdivisionsQuery.isLoading ? "Loading regions..." : "Country-wide holidays only"}
                        disabled={!countryCode}
                    />
                </div>
            </div>

            <div>
                <p className={FIELD_LABEL}>City, for weather</p>
                {location.savedCity && !changing ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] py-1 pl-3 pr-1 text-sm text-twilight-text">
                        <span className="inline-flex items-center gap-2">
                            <MapPin size={13} aria-hidden="true" />
                            {location.savedCity.name}
                        </span>
                        <span className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setChanging(true)}>Change</Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => void location.setManualLocation({ city: null })}>Remove</Button>
                        </span>
                    </div>
                ) : (
                    <form onSubmit={submitSearch} className="flex gap-2">
                        <SearchField
                            value={draft}
                            onValueChange={setDraft}
                            placeholder="Search for a city"
                            aria-label="Search for a city"
                            className="flex-1"
                        />
                        <Button type="submit" variant="secondary" disabled={draft.trim().length < 2 || citiesQuery.isFetching}>
                            <Search size={14} aria-hidden="true" />
                            Search
                        </Button>
                        {changing ? <Button type="button" variant="ghost" onClick={() => { setChanging(false); setSearch(null); setDraft(""); }}>Cancel</Button> : null}
                    </form>
                )}

                {search !== null && (!location.savedCity || changing) ? (
                    <div className="mt-2 text-sm">
                        {citiesQuery.isFetching ? (
                            <p className="px-3 py-2 text-twilight-text-soft">Searching...</p>
                        ) : citiesQuery.isError ? (
                            <p className="px-3 py-2 text-twilight-text-soft">Couldn&apos;t search cities right now.</p>
                        ) : citiesQuery.data && citiesQuery.data.length > 0 ? (
                            <ul className="flex flex-col gap-1" aria-label="City results">
                                {citiesQuery.data.map((city) => (
                                    <li key={`${city.name}-${city.latitude}-${city.longitude}`}>
                                        <button
                                            type="button"
                                            onClick={() => void chooseCity(city)}
                                            className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-twilight-text transition-colors hover:bg-white/[0.05]"
                                        >
                                            <span>{city.name}</span>
                                            <span className="text-xs text-twilight-text-muted">
                                                {[city.region, city.country].filter(Boolean).join(", ")}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="px-3 py-2 text-twilight-text-soft">No matches for &ldquo;{search}&rdquo;.</p>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
