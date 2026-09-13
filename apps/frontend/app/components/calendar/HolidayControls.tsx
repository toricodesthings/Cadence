import { MapPin, Settings2 } from "lucide-react";
import { Switch } from "../primitives";
import type { HolidayRegionSource } from "../../hooks/environment/use-holiday-overlay";

export const HOLIDAY_SOURCE_LABELS: Record<HolidayRegionSource, string> = {
    precise: "from your precise location",
    approximate: "from your approximate location",
    manual: "chosen by you",
    timezone: "from your time zone",
    locale: "from your language settings",
};

/** Holiday toggle plus the region it resolved to. Location itself lives in Settings → Location & Weather. */
export function HolidayPreferencesPanel({
    enabled,
    regionLabel,
    source,
    onEnabledChange,
    onOpenLocationSettings,
}: {
    enabled: boolean;
    regionLabel: string | null;
    source: HolidayRegionSource | null;
    onEnabledChange: (value: boolean) => void;
    onOpenLocationSettings: () => void;
}) {
    return (
        <div className="flex flex-col gap-4">
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

            <div className="flex flex-wrap items-center gap-2 text-xs text-twilight-text-soft">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1">
                    <MapPin size={12} aria-hidden="true" />
                    {regionLabel ?? "Region unknown"}
                    {source ? <span className="text-twilight-text-muted">· {HOLIDAY_SOURCE_LABELS[source]}</span> : null}
                </span>
                <button
                    type="button"
                    onClick={onOpenLocationSettings}
                    className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-accent-primary transition-colors hover:bg-accent-primary/10"
                >
                    <Settings2 size={12} aria-hidden="true" />
                    Change location
                </button>
            </div>
        </div>
    );
}
