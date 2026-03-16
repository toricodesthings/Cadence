import { Check, CircleAlert, LocateFixed, MapPin, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "../primitives/Button";
import { Switch } from "../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../primitives/Select";
import * as Tooltip from "../primitives/Tooltip";
import type { HolidayCountryOption } from "../../hooks/environment/use-holiday-overlay";

interface HolidayControlsProps {
    enabled: boolean;
    usePreciseLocation: boolean;
    locationMode: "auto" | "manual";
    countryCode: string | null;
    subdivisionCode: string | null;
    countryOptions: HolidayCountryOption[];
    subdivisionOptions: Array<{ code: string; label: string }>;
    effectiveCountryLabel: string | null;
    effectiveSubdivisionLabel: string | null;
    permissionState: "prompt" | "granted" | "denied" | "unsupported";
    locationRefreshedAt?: string | null;
    countriesLoading?: boolean;
    subdivisionsLoading?: boolean;
    isLocating?: boolean;
    compact?: boolean;
    showEnabledToggle?: boolean;
    onEnabledChange: (value: boolean) => void;
    onLocationModeChange: (value: "auto" | "manual") => void;
    onCountryChange: (value: string | null) => void;
    onSubdivisionChange: (value: string | null) => void;
    onUsePreciseLocationChange: (value: boolean) => void;
    onRequestPreciseLocation: () => void | Promise<unknown>;
}

export function HolidayPreferencesPanel({
    enabled,
    usePreciseLocation,
    locationMode,
    countryCode,
    subdivisionCode,
    countryOptions,
    subdivisionOptions,
    effectiveCountryLabel,
    effectiveSubdivisionLabel,
    permissionState,
    locationRefreshedAt,
    countriesLoading = false,
    subdivisionsLoading = false,
    isLocating = false,
    compact = false,
    showEnabledToggle = true,
    onEnabledChange,
    onLocationModeChange,
    onCountryChange,
    onSubdivisionChange,
    onUsePreciseLocationChange,
    onRequestPreciseLocation,
}: HolidayControlsProps) {
    const stackClassName = compact ? "gap-4" : "gap-5";

    return (
        <div className={`flex flex-col ${stackClassName}`}>
            {showEnabledToggle && (
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-sm font-medium text-twilight-text">Holiday overlay</p>
                        <p className="mt-1 text-xs leading-relaxed text-twilight-text-soft">
                            Public holidays as quiet markers in the calendar.
                        </p>
                    </div>
                    <Switch
                        checked={enabled}
                        onCheckedChange={onEnabledChange}
                        aria-label="Toggle holiday overlay"
                    />
                </div>
            )}

            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Holiday location mode">
                {(["auto", "manual"] as const).map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        onClick={() => onLocationModeChange(mode)}
                        role="radio"
                        aria-checked={locationMode === mode}
                        className={`rounded-2xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                            locationMode === mode
                                ? "border-lantern/30 bg-lantern/12 text-lantern"
                                : "border-white/[0.08] bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text"
                        }`}
                    >
                        {mode}
                    </button>
                ))}
            </div>

            {locationMode === "auto" ? (
                <div className="rounded-[1.4rem] border border-white/[0.05] bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium text-twilight-text">Automatic location</p>
                            <p className="text-xs leading-relaxed text-twilight-text-soft">
                                Locale and timezone first, then precise location if you allow it.
                            </p>
                        </div>
                        <Switch
                            checked={usePreciseLocation}
                            onCheckedChange={onUsePreciseLocationChange}
                            disabled={permissionState === "unsupported"}
                            aria-label="Use precise location for holidays"
                        />
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-twilight-text-soft">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
                            <MapPin size={12} aria-hidden="true" />
                            {effectiveCountryLabel ?? "Detecting country"}
                            {effectiveSubdivisionLabel ? ` · ${effectiveSubdivisionLabel}` : ""}
                        </span>
                        {locationRefreshedAt ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
                                Refreshed {new Date(locationRefreshedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                        ) : null}
                        {permissionState === "denied" && <HolidayAccuracyHint />}
                        {permissionState !== "granted" && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="text-[11px]"
                                onClick={() => void onRequestPreciseLocation()}
                                disabled={isLocating}
                            >
                                <LocateFixed size={13} aria-hidden="true" />
                                {isLocating ? "Locating..." : "Use precise location"}
                            </Button>
                        )}
                    </div>

                    {permissionState === "denied" && (
                        <p className="mt-3 text-xs leading-relaxed text-twilight-text-soft">
                            Precise location is blocked, so Cadence is falling back to broader country-level matching.
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid gap-3">
                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">
                            Country
                        </p>
                        <Select
                            value={countryCode ?? "__none__"}
                            onValueChange={(value) => onCountryChange(value === "__none__" ? null : value)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={countriesLoading ? "Loading countries..." : "Choose a country"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">No country selected</SelectItem>
                                {countryOptions.map((country) => (
                                    <SelectItem key={country.code} value={country.code}>
                                        {country.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-twilight-text-soft">
                            Region / State
                        </p>
                        <Select
                            value={subdivisionCode ?? "__none__"}
                            onValueChange={(value) => onSubdivisionChange(value === "__none__" ? null : value)}
                            disabled={!countryCode}
                        >
                            <SelectTrigger>
                                <SelectValue
                                    placeholder={
                                        !countryCode
                                            ? "Select a country first"
                                            : subdivisionsLoading
                                                ? "Loading regions..."
                                                : "Country-wide holidays only"
                                    }
                                />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__none__">Country-wide holidays only</SelectItem>
                                {subdivisionOptions.map((subdivision) => (
                                    <SelectItem key={subdivision.code} value={subdivision.code}>
                                        {subdivision.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}
        </div>
    );
}

export function HolidayLocationPrompt({
    onUsePreciseLocation,
    onDismiss,
    onDismissPermanently,
    onChooseManual,
    isLocating = false,
}: {
    onUsePreciseLocation: () => void | Promise<unknown>;
    onDismiss: () => void;
    onDismissPermanently: () => void;
    onChooseManual: () => void;
    isLocating?: boolean;
}) {
    return (
        <div className="rounded-[1.75rem] border border-moonlit/18 bg-[linear-gradient(180deg,rgba(23,35,58,0.96),rgba(11,20,36,0.98))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
            <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-moonlit/20 bg-moonlit/10 text-moonlit">
                    <Sparkles size={16} strokeWidth={2} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-medium text-twilight-text">Holiday overlay</p>
                    <p className="mt-1 text-sm leading-relaxed text-twilight-text-soft">
                        Regional holidays feel steadier when Cadence knows your area or when you choose the region yourself.
                    </p>
                </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                    type="button"
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-moonlit/25 bg-moonlit/10 px-4 text-sm font-medium text-moonlit transition-colors hover:bg-moonlit/15 disabled:cursor-wait disabled:opacity-70"
                    onClick={() => void onUsePreciseLocation()}
                    disabled={isLocating}
                >
                    <LocateFixed size={14} aria-hidden="true" />
                    {isLocating ? "Locating..." : "Use precise location"}
                </button>
                <button
                    type="button"
                    className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-twilight-text transition-colors hover:bg-white/[0.07]"
                    onClick={onChooseManual}
                >
                    Choose manually
                </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-twilight-text-muted">
                <button
                    type="button"
                    className="cursor-pointer transition-colors hover:text-twilight-text"
                    onClick={onDismiss}
                >
                    Not now
                </button>
                <button
                    type="button"
                    className="cursor-pointer transition-colors hover:text-twilight-text"
                    onClick={onDismissPermanently}
                >
                    Don&apos;t remind again
                </button>
            </div>
        </div>
    );
}

export function HolidayAccuracyHint({ variant = "pill" }: { variant?: "pill" | "icon" }) {
    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>
                <button
                    type="button"
                    className={
                        variant === "icon"
                            ? "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                            : "inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-xs text-twilight-text-soft"
                    }
                    aria-label="Holiday accuracy details"
                >
                    <CircleAlert size={12} aria-hidden="true" />
                    {variant === "pill" ? "Less precise" : null}
                </button>
            </Tooltip.Trigger>
            <Tooltip.Content>
                Precise location is off, so regional holidays may fall back to broader country-level matches.
            </Tooltip.Content>
        </Tooltip.Root>
    );
}

export function HolidayQuickToggle({
    checked,
    onCheckedChange,
    onOpenSettings,
    showAccuracyHint = false,
}: {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    onOpenSettings: () => void;
    showAccuracyHint?: boolean;
}) {
    return (
        <div className="inline-flex min-h-11 items-center gap-1 rounded-2xl border border-twilight-border bg-white/[0.03] p-1">
            <label className="inline-flex min-h-9 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.04] hover:text-twilight-text">
                <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={(event) => onCheckedChange(event.target.checked)}
                    aria-label="Toggle holiday overlay"
                />
                <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                        checked
                            ? "border-lantern/45 bg-lantern/18 text-lantern"
                            : "border-twilight-border-light bg-white/[0.02] text-transparent"
                    }`}
                >
                    <Check size={12} strokeWidth={2.5} />
                </span>
                <span>Holidays</span>
            </label>

            {showAccuracyHint ? <HolidayAccuracyHint variant="icon" /> : null}

            <button
                type="button"
                onClick={onOpenSettings}
                className="btn-icon h-9 w-9 rounded-xl text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                aria-label="Holiday overlay settings"
            >
                <SlidersHorizontal size={15} aria-hidden="true" />
            </button>
        </div>
    );
}
