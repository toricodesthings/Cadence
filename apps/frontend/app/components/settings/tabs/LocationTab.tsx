import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Compass, EyeOff, LocateFixed, MapPin, Search, SlidersHorizontal, type LucideIcon } from "lucide-react";
import type { CityResult } from "@cadence/contracts/proxy";
import type { LocationMode } from "@cadence/contracts/settings";
import { Button, Input, Switch } from "../../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../primitives/Select";
import { SettingsRow, SettingsSection } from "../layout/SettingsLayout";
import { HOLIDAY_SOURCE_LABELS } from "../../calendar/HolidayControls";
import { useSettings, useUpdateSettings } from "../../../hooks/core/use-settings";
import { useApiClient } from "../../../hooks/auth/use-api-client";
import { useUserLocation, type LocationSource, type ResolvedPlace } from "../../../hooks/environment/use-user-location";
import { useHolidayOverlay } from "../../../hooks/environment/use-holiday-overlay";
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
        description: "Estimated from your network connection. Close enough for weather and regional holidays, with no permission prompt.",
        icon: Compass,
    },
    {
        mode: "precise",
        label: "Precise",
        description: "Uses your device's location services. Your browser asks for permission once.",
        icon: LocateFixed,
    },
    {
        mode: "manual",
        label: "Choose myself",
        description: "Pick your country, region, and city. Nothing is looked up automatically.",
        icon: SlidersHorizontal,
    },
    {
        mode: "off",
        label: "Off",
        description: "No location at all. Weather is hidden and holidays follow your time zone.",
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
    return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function LocationTab() {
    const location = useUserLocation();
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();
    const locale = getPreferredLocale();
    const year = new Date().getFullYear();
    const holidays = useHolidayOverlay({
        start: `${year}-01-01`,
        end: `${year}-12-31`,
        viewMode: "year",
        fetchOverlay: false,
    });
    const weatherEnabled = settings?.weather?.enabled ?? true;

    const holidayDescription = holidays.regionLabel && holidays.source
        ? `${holidays.regionLabel}, ${HOLIDAY_SOURCE_LABELS[holidays.source]}.`
        : "Public holidays as quiet markers in the calendar.";

    const handleForget = () => {
        location.forgetLocation();
        toast.success("Removed the location saved on this device.");
    };

    return (
        <div className="flex flex-col gap-10">
            <div>
                <h2 className="mb-2 text-2xl font-bold text-twilight-text">Location & Weather</h2>
                <p className="text-sm leading-relaxed text-twilight-text-soft">
                    Cadence uses your location for two things: the weather on Home and the public holidays on your
                    calendar. Choose how much it knows, or turn it off.
                </p>
            </div>

            <SettingsSection title="How Cadence finds you">
                <ModePicker location={location} />
                <CurrentLocation location={location} locale={locale} subdivisionFallback={holidays.subdivisionLabel} />
                {location.mode === "manual" ? (
                    <ManualLocationEditor location={location} locale={locale} year={year} />
                ) : null}
            </SettingsSection>

            <SettingsSection title="Used for">
                <SettingsRow
                    title="Weather"
                    description={location.mode === "off"
                        ? "Hidden while location is off."
                        : "Current temperature and conditions next to the date on Home."}
                >
                    <Switch
                        checked={weatherEnabled}
                        onCheckedChange={(enabled) => updateSettings.mutate({ weather: { enabled } })}
                        aria-label="Show weather"
                    />
                </SettingsRow>
                <SettingsRow title="Holidays" description={holidayDescription}>
                    <Switch
                        checked={holidays.enabled}
                        onCheckedChange={holidays.setEnabled}
                        aria-label="Show holidays"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection title="What's shared">
                <div className="flex flex-col gap-3 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4 text-sm leading-relaxed text-twilight-text-soft">
                    <p>
                        Coordinates are rounded to about 1 km before they leave your device. Cadence uses them to fetch
                        weather from Open-Meteo and, for precise location, to name your region through OpenStreetMap.
                        A precise position stays cached on this device for up to 7 days and is cleared when you sign out.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Link to="/privacy-policy" className="text-accent-primary hover:underline">
                            Privacy policy
                        </Link>
                        <Button type="button" variant="secondary" size="sm" onClick={handleForget}>
                            Forget saved location
                        </Button>
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}

function ModePicker({ location }: { location: UserLocation }) {
    return (
        <div role="radiogroup" aria-label="Location mode" className="grid gap-2 sm:grid-cols-2">
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
                        <span className="text-xs leading-relaxed text-twilight-text-soft">{description}</span>
                    </button>
                );
            })}
        </div>
    );
}

function CurrentLocation({
    location,
    locale,
    subdivisionFallback,
}: {
    location: UserLocation;
    locale: string;
    subdivisionFallback: string | null;
}) {
    const { place } = location;
    const label = location.mode === "off"
        ? "Location is off"
        : place
            ? formatPlace(place, locale, subdivisionFallback)
            : location.isResolving ? "Finding your area..." : "Not set yet";

    return (
        <div className="rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">Current location</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-twilight-text">
                <MapPin size={14} aria-hidden="true" className="text-twilight-text-soft" />
                <span>{label}</span>
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

function ManualLocationEditor({ location, locale, year }: { location: UserLocation; locale: string; year: number }) {
    const client = useApiClient();
    const countryCode = location.manualCountryCode;
    const [draft, setDraft] = useState("");
    const [search, setSearch] = useState<string | null>(null);

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
        queryFn: async () => unwrapResponse<CityResult[]>(
            await client.api.proxy.geocode.search.$get({ query: { name: search!, locale } }),
        ),
        enabled: search !== null,
        staleTime: 60 * 60 * 1000,
        meta: { persist: false },
    });

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
        }
    };

    return (
        <div className="grid gap-4 rounded-[1.4rem] border border-white/[0.04] bg-white/[0.02] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">Country</p>
                    <Select
                        value={countryCode ?? "__none__"}
                        onValueChange={(value) => void location.setManualLocation({
                            countryCode: value === "__none__" ? null : value,
                            subdivisionCode: null,
                        })}
                    >
                        <SelectTrigger aria-label="Country">
                            <SelectValue placeholder={countriesQuery.isLoading ? "Loading countries..." : "Choose a country"} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">Use my time zone</SelectItem>
                            {(countriesQuery.data ?? []).map((country) => (
                                <SelectItem key={country.code} value={country.code}>
                                    {country.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">Region / State</p>
                    <Select
                        value={location.manualSubdivisionCode ?? "__none__"}
                        onValueChange={(value) => void location.setManualLocation({
                            subdivisionCode: value === "__none__" ? null : value,
                        })}
                        disabled={!countryCode}
                    >
                        <SelectTrigger aria-label="Region or state">
                            <SelectValue
                                placeholder={
                                    !countryCode
                                        ? "Select a country first"
                                        : subdivisionsQuery.isLoading ? "Loading regions..." : "Country-wide holidays only"
                                }
                            />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__none__">Country-wide holidays only</SelectItem>
                            {(subdivisionsQuery.data ?? []).map((subdivision) => (
                                <SelectItem key={subdivision.code} value={subdivision.code}>
                                    {subdivision.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">City, for weather</p>
                {location.savedCity ? (
                    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1 text-sm text-twilight-text">
                        <span className="inline-flex items-center gap-2">
                            <MapPin size={13} aria-hidden="true" />
                            {location.savedCity.name}
                        </span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => void location.setManualLocation({ city: null })}>
                            Remove
                        </Button>
                    </div>
                ) : null}

                <form onSubmit={submitSearch} className="flex gap-2">
                    <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        placeholder="Search for a city"
                        aria-label="Search for a city"
                    />
                    <Button type="submit" variant="secondary" disabled={draft.trim().length < 2 || citiesQuery.isFetching}>
                        <Search size={14} aria-hidden="true" />
                        Search
                    </Button>
                </form>

                {search !== null ? (
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

                {!location.savedCity ? (
                    <p className="mt-2 text-xs text-twilight-text-muted">Add a city to see weather in this mode.</p>
                ) : null}
            </div>
        </div>
    );
}
