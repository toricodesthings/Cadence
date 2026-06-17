import React, { useState } from "react";
import { Tip } from "../primitives";

/**
 * CadencePicker — manifesto-compliant cadence selector
 *
 * Three presets (Every day, Weekdays, Weekends) + Custom mode.
 * Custom reveals Mon–Sun day toggles with minimum 44×44px touch targets,
 * warm amber selection states, and generous breathing room.
 *
 * Produces standard RRULE strings: "FREQ=DAILY" or "FREQ=WEEKLY;BYDAY=MO,WE,…"
 */

const BYDAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
type ByDay = (typeof BYDAY_ORDER)[number];

const DAY_ABBR: Record<ByDay, { short: string; full: string }> = {
    MO: { short: "M", full: "Monday" },
    TU: { short: "Tu", full: "Tuesday" },
    WE: { short: "W", full: "Wednesday" },
    TH: { short: "Th", full: "Thursday" },
    FR: { short: "F", full: "Friday" },
    SA: { short: "Sa", full: "Saturday" },
    SU: { short: "Su", full: "Sunday" },
};

interface Preset {
    label: string;
    value: string;
}

const PRESETS: Preset[] = [
    { label: "Every day", value: "FREQ=DAILY" },
    { label: "Weekdays", value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" },
    { label: "Weekends", value: "FREQ=WEEKLY;BYDAY=SA,SU" },
];

function buildRrule(days: ByDay[]): string {
    if (days.length === 0) return "FREQ=WEEKLY;BYDAY=MO";
    const ordered = BYDAY_ORDER.filter((d) => days.includes(d));
    return `FREQ=WEEKLY;BYDAY=${ordered.join(",")}`;
}

function parseByDay(rrule: string): ByDay[] {
    const match = rrule.match(/BYDAY=([^;]+)/);
    if (!match) return [];
    return match[1].split(",").filter((d): d is ByDay =>
        (BYDAY_ORDER as readonly string[]).includes(d)
    );
}

function isPreset(rrule: string) {
    return PRESETS.some((p) => p.value === rrule);
}

interface CadencePickerProps {
    value: string;
    onChange: (rrule: string) => void;
}

export function CadencePicker({ value, onChange }: CadencePickerProps) {
    const [mode, setMode] = useState<"preset" | "custom">(
        isPreset(value) ? "preset" : "custom"
    );
    const [customDays, setCustomDays] = useState<ByDay[]>(
        isPreset(value) ? ["MO", "WE", "FR"] : parseByDay(value)
    );

    const handlePreset = (preset: Preset) => {
        setMode("preset");
        onChange(preset.value);
    };

    const handleCustom = () => {
        setMode("custom");
        onChange(buildRrule(customDays));
    };

    const toggleDay = (day: ByDay) => {
        const isSelected = customDays.includes(day);
        // Must keep at least one day
        if (isSelected && customDays.length === 1) return;
        const next = isSelected
            ? customDays.filter((d) => d !== day)
            : [...customDays, day];
        setCustomDays(next);
        onChange(buildRrule(next));
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Preset + Custom toggles */}
            <div role="group" aria-label="Habit cadence" className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => {
                    const active = mode === "preset" && value === preset.value;
                    return (
                        <button
                            key={preset.value}
                            type="button"
                            onClick={() => handlePreset(preset)}
                            aria-pressed={active}
                            className={`
                                px-4 py-2 rounded-2xl text-[13px] font-medium
                                transition-colors duration-200 cursor-pointer
                                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-deep
                                ${active
                                    ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25 shadow-[0_0_12px_color-mix(in_srgb,var(--accent-primary)_8%,transparent)]"
                                    : "bg-white/[0.04] border border-white/[0.08] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.07]"
                                }
                            `}
                        >
                            {preset.label}
                        </button>
                    );
                })}

                <button
                    type="button"
                    onClick={handleCustom}
                    aria-pressed={mode === "custom"}
                    className={`
                        px-4 py-2 rounded-2xl text-[13px] font-medium
                        transition-colors duration-200 cursor-pointer
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-twilight-deep
                        ${mode === "custom"
                            ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25 shadow-[0_0_12px_color-mix(in_srgb,var(--accent-primary)_8%,transparent)]"
                            : "bg-white/[0.04] border border-white/[0.08] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.07]"
                        }
                    `}
                >
                    Custom
                </button>
            </div>

            {/* Day-of-week grid — only visible in custom mode */}
            {mode === "custom" && (
                <div
                    role="group"
                    aria-label="Select days of the week"
                    className="flex gap-1.5"
                >
                    {BYDAY_ORDER.map((day) => {
                        const selected = customDays.includes(day);
                        const { short, full } = DAY_ABBR[day];
                        return (
                            <Tip key={day} label={full} side="top">
                                <button
                                    type="button"
                                    aria-label={full}
                                    aria-pressed={selected}
                                    onClick={() => toggleDay(day)}
                                    className={`
                                        flex-1 min-w-[44px] h-11 rounded-2xl text-[12px] font-semibold
                                        transition-colors duration-200 cursor-pointer
                                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50
                                        touch-manipulation select-none
                                        ${selected
                                            ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/25 shadow-[0_0_10px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)]"
                                            : "bg-white/[0.04] border border-white/[0.07] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.07]"
                                        }
                                    `}
                                >
                                    {short}
                                </button>
                            </Tip>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
