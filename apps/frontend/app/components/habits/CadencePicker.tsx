import { useState } from "react";
import { Minus, Plus, Repeat, Repeat2 } from "lucide-react";
import { FieldRow, ValueSelect } from "../shared/DetailPanelSections";
import { ComposerTabs, ComposerToggle, WeekdayPicker, WEEKDAY_ORDER, type WeekdayCode } from "../shared/Composer";
import { RRULE_WEEKDAYS } from "../../lib/constants/repeat";

/**
 * Which days a routine runs: Daily (every N days), Mon–Fri, Sat–Sun, or
 * Custom with Mon–Sun toggles and "every other week". Built from the
 * composer's segmented control and weekday picker so it matches schedule
 * creation; `select` swaps the segmented control for a Repeats row with a
 * dropdown, for narrow panels. Produces "FREQ=DAILY[;INTERVAL=N]" or "FREQ=WEEKLY[;INTERVAL=2];BYDAY=…".
 */

type CadenceMode = "daily" | "weekdays" | "weekends" | "custom";

const PRESETS: Record<"weekdays" | "weekends", string> = {
    weekdays: RRULE_WEEKDAYS,
    weekends: "FREQ=WEEKLY;BYDAY=SA,SU",
};

const OPTIONS = [
    { id: "daily", label: "Daily" },
    { id: "weekdays", label: "Mon–Fri" },
    { id: "weekends", label: "Sat–Sun" },
    { id: "custom", label: "Custom" },
] as const;

/** The dropdown has room to say it in full. */
const SELECT_OPTIONS = [
    { value: "daily", label: "Daily" },
    { value: "weekdays", label: "Weekdays (Mon–Fri)" },
    { value: "weekends", label: "Weekends (Sat–Sun)" },
    { value: "custom", label: "Custom days" },
];

const MAX_EVERY = 30;
const STEP_BUTTON = "flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-twilight-border/40 text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text disabled:cursor-default disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";

function parse(rrule: string) {
    const parts = new Map(rrule.split(";").map((part) => part.split("=") as [string, string]));
    const days = (parts.get("BYDAY") ?? "").split(",").filter((d): d is WeekdayCode => (WEEKDAY_ORDER as string[]).includes(d));
    return { freq: parts.get("FREQ"), interval: Math.max(1, Number(parts.get("INTERVAL") ?? 1) || 1), days };
}

function weekly(days: WeekdayCode[], everyOtherWeek: boolean): string {
    const ordered = WEEKDAY_ORDER.filter((d) => days.includes(d));
    return `FREQ=WEEKLY;${everyOtherWeek ? "INTERVAL=2;" : ""}BYDAY=${(ordered.length ? ordered : ["MO"]).join(",")}`;
}

function daily(every: number): string {
    return every > 1 ? `FREQ=DAILY;INTERVAL=${every}` : "FREQ=DAILY";
}

function modeOf(rrule: string): CadenceMode {
    if (rrule.startsWith("FREQ=DAILY")) return "daily";
    return (Object.keys(PRESETS) as Array<keyof typeof PRESETS>).find((key) => PRESETS[key] === rrule) ?? "custom";
}

export function CadencePicker({ value, onChange, select = false }: { value: string; onChange: (rrule: string) => void; select?: boolean }) {
    const [customPicked, setCustomPicked] = useState(false);
    const mode = customPicked ? "custom" : modeOf(value);
    const { interval, days } = parse(value);
    const pick = (next: CadenceMode) => {
        setCustomPicked(next === "custom");
        onChange(next === "custom" ? weekly(days.length ? days : ["MO", "WE", "FR"], false) : next === "daily" ? "FREQ=DAILY" : PRESETS[next]);
    };

    return (
        <div className="flex flex-col gap-3">
            {select ? (
                <FieldRow icon={Repeat} label="Repeats">
                    <ValueSelect label="Routine cadence" value={mode} onChange={(next) => pick(next as CadenceMode)} options={SELECT_OPTIONS} />
                </FieldRow>
            ) : <ComposerTabs ariaLabel="Routine cadence" options={OPTIONS} value={mode} onChange={pick} />}
            {mode === "daily" ? (
                <div className={`flex items-center gap-2 ${select ? "pl-6 text-[13px] text-twilight-text-soft" : "text-sm text-twilight-text"}`} role="group" aria-label="How often">
                    <span className="flex-1" aria-live="polite">Every {interval > 1 ? `${interval} days` : "day"}</span>
                    <button type="button" className={STEP_BUTTON} aria-label="Fewer days between" disabled={interval <= 1} onClick={() => onChange(daily(interval - 1))}>
                        <Minus size={14} aria-hidden="true" />
                    </button>
                    <button type="button" className={STEP_BUTTON} aria-label="More days between" disabled={interval >= MAX_EVERY} onClick={() => onChange(daily(interval + 1))}>
                        <Plus size={14} aria-hidden="true" />
                    </button>
                </div>
            ) : null}
            {mode === "custom" ? (
                <div className={`flex flex-col gap-3 ${select ? "pl-6" : ""}`}>
                    <WeekdayPicker value={days} onChange={(next) => onChange(weekly(next, interval === 2))} />
                    <ComposerToggle
                        icon={Repeat2}
                        label="Every other week"
                        description="Counts from the week the routine started."
                        checked={interval === 2}
                        onCheckedChange={(on) => onChange(weekly(days, on))}
                        ariaLabel="Every other week"
                    />
                </div>
            ) : null}
        </div>
    );
}
