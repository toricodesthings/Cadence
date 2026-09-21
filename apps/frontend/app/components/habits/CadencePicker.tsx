import { useState } from "react";
import { ComposerTabs, WeekdayPicker, WEEKDAY_ORDER, type WeekdayCode } from "../shared/Composer";
import { RRULE_WEEKDAYS } from "../../lib/constants/repeat";

/**
 * Which days a routine runs: Every day / Weekdays / Weekends, or Custom with
 * Mon–Sun toggles. Built from the composer's segmented control and weekday
 * picker so it matches schedule creation. Produces "FREQ=DAILY" or
 * "FREQ=WEEKLY;BYDAY=MO,WE,…".
 */

type CadenceMode = "daily" | "weekdays" | "weekends" | "custom";

const PRESETS: Record<Exclude<CadenceMode, "custom">, string> = {
    daily: "FREQ=DAILY",
    weekdays: RRULE_WEEKDAYS,
    weekends: "FREQ=WEEKLY;BYDAY=SA,SU",
};

const OPTIONS = [
    { id: "daily", label: "Every day" },
    { id: "weekdays", label: "Weekdays" },
    { id: "weekends", label: "Weekends" },
    { id: "custom", label: "Custom" },
] as const;

function buildRrule(days: WeekdayCode[]): string {
    const ordered = WEEKDAY_ORDER.filter((d) => days.includes(d));
    return `FREQ=WEEKLY;BYDAY=${(ordered.length ? ordered : ["MO"]).join(",")}`;
}

function parseByDay(rrule: string): WeekdayCode[] {
    const match = rrule.match(/BYDAY=([^;]+)/);
    if (!match) return [];
    return match[1].split(",").filter((d): d is WeekdayCode => (WEEKDAY_ORDER as string[]).includes(d));
}

function modeOf(rrule: string): CadenceMode {
    return (Object.keys(PRESETS) as Array<keyof typeof PRESETS>).find((key) => PRESETS[key] === rrule) ?? "custom";
}

export function CadencePicker({ value, onChange }: { value: string; onChange: (rrule: string) => void }) {
    const [customPicked, setCustomPicked] = useState(false);
    const mode = customPicked ? "custom" : modeOf(value);
    const days = parseByDay(value);

    return (
        <div className="flex flex-col gap-3">
            <ComposerTabs
                ariaLabel="Routine cadence"
                options={OPTIONS}
                value={mode}
                onChange={(next) => {
                    setCustomPicked(next === "custom");
                    onChange(next === "custom" ? buildRrule(days.length ? days : ["MO", "WE", "FR"]) : PRESETS[next]);
                }}
            />
            {mode === "custom" ? <WeekdayPicker value={days} onChange={(next) => onChange(buildRrule(next))} /> : null}
        </div>
    );
}
