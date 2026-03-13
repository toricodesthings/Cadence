import * as React from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./Select";

interface TimePickerProps {
    value: string;
    onChange: (value: string) => void;
    icon?: React.ReactNode;
    className?: string;
}

const HOURS = Array.from({ length: 12 }, (_, i) => {
    const h = i + 1;
    return { value: String(h), label: String(h) };
});

const MINUTES = Array.from({ length: 12 }, (_, i) => {
    const m = i * 5;
    return { value: String(m), label: String(m).padStart(2, "0") };
});

const PERIODS: { value: "AM" | "PM"; label: string }[] = [
    { value: "AM", label: "AM" },
    { value: "PM", label: "PM" },
];

function parse24(value: string): { hour: string; minute: string; period: "AM" | "PM" } {
    const [h24, m] = value.split(":").map(Number);
    const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
    // Snap minute to nearest 5
    const snapped = Math.round(m / 5) * 5;
    return { hour: String(h12), minute: String(snapped >= 60 ? 0 : snapped), period };
}

function to24(hour: string, minute: string, period: "AM" | "PM"): string {
    let h = Number(hour);
    if (period === "AM" && h === 12) h = 0;
    else if (period === "PM" && h !== 12) h += 12;
    const m = Number(minute);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function TimePicker({ value, onChange, icon, className }: TimePickerProps) {
    const parsed = React.useMemo(() => parse24(value), [value]);

    const update = React.useCallback(
        (field: "hour" | "minute" | "period", next: string) => {
            const h = field === "hour" ? next : parsed.hour;
            const m = field === "minute" ? next : parsed.minute;
            const p = field === "period" ? (next as "AM" | "PM") : parsed.period;
            onChange(to24(h, m, p));
        },
        [parsed, onChange],
    );

    const selectContentClass = "z-[200]";
    const selectTriggerBase =
        "h-auto min-h-9 cursor-pointer gap-0 rounded-lg border-0 bg-transparent px-1.5 py-1 text-sm shadow-none ring-0 hover:bg-white/[0.06] focus:ring-0 [&>svg]:hidden";

    return (
        <div className={`flex items-center gap-0.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2 py-1 ${className ?? ""}`}>
            {icon && <span className="mr-1 shrink-0">{icon}</span>}

            <Select value={parsed.hour} onValueChange={(v) => update("hour", v)}>
                <SelectTrigger className={selectTriggerBase} aria-label="Hour">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass} position="item-aligned">
                    {HOURS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <span className="text-sm text-twilight-text-muted">:</span>

            <Select value={parsed.minute} onValueChange={(v) => update("minute", v)}>
                <SelectTrigger className={selectTriggerBase} aria-label="Minute">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass} position="item-aligned">
                    {MINUTES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={parsed.period} onValueChange={(v) => update("period", v)}>
                <SelectTrigger className={`${selectTriggerBase} text-twilight-text-muted`} aria-label="AM or PM">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className={selectContentClass} position="item-aligned">
                    {PERIODS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
